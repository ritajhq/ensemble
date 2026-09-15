import { basename, join } from "@std/path";
import * as KitSdk from "@ensemble/kit-sdk";
import { loadDeployContext } from "./deploy-context.ts";
import { SubprocessPackKitGateway } from "./pack-kit-gateway.ts";
import { RunPackReleasePacker } from "./release-packer.ts";
import { runBuild } from "./build.ts";

export type DeployTermination = "eject" | "plan" | "apply";

export interface RunDeployOptions {
  artifacts: KitSdk.Deploy.ArtifactsSource;
  /** Which released version `${release.<name>}` resolves to for published artifacts — meaningless for local artifacts, where the local tag is always used regardless. */
  version: string;
  termination: DeployTermination;
  acceptCapabilityGaps: boolean;
  /** Run the kit's long-lived watch command instead of a one-shot apply, torn down cleanly on SIGINT. Also starts one companion `ens build --watch` per app any resource's `development.sync` references, so the kit's own sync has freshly built output to copy — both torn down together. Ignored by `eject`/`plan`. */
  watch: boolean;
  /** Pack the referenced releases before a local apply. `true` by default; ignored for published artifacts. */
  pack: boolean;
  /** Before a real apply, stand up a local substitute for each `deploy.external` entry the target's kit knows how to emulate, instead of assuming it already exists elsewhere (`docker network create` for a compose external network). Ignored by `eject`/`plan`. */
  emulateExternals: boolean;
  /** Let a local apply's pack step show the kit's own build-tool output (e.g. `docker buildx build`'s progress log) instead of hiding it behind the pack spinner. Ignored for published artifacts, which never pack. */
  verbose: boolean;
}

/**
 * Keeps every app a `--watch` session's `development.sync` rules reference
 * freshly built, so the kit's own file-watching sync (`docker compose
 * watch`'s `develop.watch`) has real, current output to copy in — the
 * "rebuild-on-change" companion this plan's Section 8 reserved. One
 * `ens build <app> --watch` per app, all sharing one signal installed once
 * here (the same `RunBuildOptions.signal` seam `runBuild` already exposed
 * for exactly this), so a single `SIGINT` tears every one of them down
 * together with the main watch step, which is handed the same signal
 * instead of installing its own.
 */
class CompanionBuildWatchers {
  private constructor(
    readonly signal: AbortSignal,
    private readonly controller: AbortController,
    private readonly sigintListener: () => void,
    private readonly watchers: readonly Promise<number>[],
  ) {}

  static start(apps: ReadonlySet<string>): CompanionBuildWatchers {
    const controller = new AbortController();
    const sigintListener = () => controller.abort();
    Deno.addSignalListener("SIGINT", sigintListener);

    console.log(`Building & watching: ${[...apps].join(", ")}`);
    const watchers = [...apps].map((app) =>
      runBuild(app, {
        mode: "development",
        watch: true,
        signal: controller.signal,
      })
    );

    return new CompanionBuildWatchers(
      controller.signal,
      controller,
      sigintListener,
      watchers,
    );
  }

  async stop(): Promise<void> {
    this.controller.abort();
    Deno.removeSignalListener("SIGINT", this.sigintListener);
    await Promise.allSettled(this.watchers);
  }
}

/**
 * Resolves a deployment's workload manifest and deploy kit by name, and runs
 * the requested termination (eject/plan/apply) via the new
 * `DeploymentCoordinator` (Phase 6). A from-scratch rebuild of the old
 * `runDeploy` (removed per the rearchitecture's G1) — same manifest/kit
 * resolution conventions (`ci/<name>/delivery.yml`,
 * `.ensemble/kits/deploy/<kit>/`), but a fundamentally different pipeline
 * underneath (contracts, negotiated values, dependency-ordered render,
 * three terminations instead of one up/down action).
 */
export async function runDeploy(
  name: string,
  kit: string,
  options: RunDeployOptions,
): Promise<void> {
  const { repoRoot, workload, target, registry } = await loadDeployContext(
    name,
    kit,
  );

  const gateway = new SubprocessPackKitGateway();
  const locatorResolver = new KitSdk.Deploy.ReleaseLocatorResolver(gateway);
  const releaseLocator = new KitSdk.Deploy.PreresolvedReleaseLocator(
    await locatorResolver.resolveAll(
      workload,
      options.artifacts,
      options.version,
    ),
  );
  const renderer = new KitSdk.Deploy.Render.Renderer(
    new KitSdk.Deploy.Render.ReferenceResolver(target.kit.realization()),
    releaseLocator,
    registry,
  );

  // A kit's native scoping identifier (a compose project name, a
  // CloudFormation stack name) lives in a namespace shared across the whole
  // Docker host / AWS account — unlike outputsDir/cache below, which already
  // live inside this one repo checkout and can't collide with anything.
  // Prefixing with the repo dir's own basename (e.g. "ensemble-website"
  // rather than a bare "website") keeps two different repos — or two
  // worktrees of the same one — from colliding on the same host.
  const deploymentName = `${basename(repoRoot)}-${name}`;

  const outputsDir = join(repoRoot, "source", "artifacts", "deploy", name);
  const sink = new KitSdk.Deploy.Terminations.FileArtifactSink(outputsDir);
  const cache = new KitSdk.Deploy.Terminations.FileRenderCache(
    join(repoRoot, ".ensemble", "deploy", name, "last-rendered.txt"),
  );

  const watchedApps = options.watch
    ? KitSdk.Deploy.discoverWatchedApps(workload)
    : new Set<string>();

  const coordinator = new KitSdk.Deploy.Terminations.DeploymentCoordinator(
    registry,
    renderer,
    new KitSdk.Deploy.Terminations.Ejector(sink),
    new KitSdk.Deploy.Terminations.Planner(cache),
    new KitSdk.Deploy.Terminations.Applier(sink, cache),
    new KitSdk.Deploy.Terminations.ReleaseAvailabilityPreflight(gateway),
    new KitSdk.Deploy.Terminations.LocalArtifactsPacker(
      new RunPackReleasePacker(watchedApps, options.verbose),
    ),
    new KitSdk.Deploy.Terminations.WatchRunner(sink),
    new KitSdk.Deploy.Terminations.ExternalsEmulator(),
  );

  const buildWatchers = watchedApps.size > 0
    ? CompanionBuildWatchers.start(watchedApps)
    : undefined;

  try {
    const result = await coordinator.deploy(deploymentName, workload, target, {
      artifacts: options.artifacts,
      termination: options.termination,
      acceptCapabilityGaps: options.acceptCapabilityGaps,
      version: options.version,
      pack: options.pack,
      watch: options.watch,
      emulateExternals: options.emulateExternals,
      signal: buildWatchers?.signal,
    });

    for (const report of result.gaps) {
      console.warn(
        `warning: capability "${report.gap.capability}" unmet by kit "${kit}" on ${report.resource} (requested ${report.gap.requested}) — accepted.`,
      );
    }

    presentResult(result, name, options.watch);
  } finally {
    await buildWatchers?.stop();
  }
}

function presentResult(
  result: KitSdk.Deploy.Terminations.DeployResult,
  name: string,
  watched: boolean,
): void {
  switch (result.termination) {
    case "eject":
      console.log(`Ejected ${result.artifact.filename} for "${name}":\n`);
      console.log(result.artifact.content);
      break;
    case "plan":
      if (!result.diff.changed) {
        console.log("No changes.");
        break;
      }
      for (const line of result.diff.lines) {
        const prefix = line.kind === "added"
          ? "+"
          : line.kind === "removed"
          ? "-"
          : " ";
        console.log(`${prefix} ${line.text}`);
      }
      break;
    case "apply":
      console.log(
        watched ? `Watch session for "${name}" ended.` : `Applied "${name}".`,
      );
      break;
  }
}
