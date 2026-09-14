import { join } from "@std/path";
import * as KitSdk from "@ensemble/kit-sdk";
import { loadDeployContext } from "./deploy-context.ts";
import { SubprocessPackKitGateway } from "./pack-kit-gateway.ts";
import { RunPackReleasePacker } from "./release-packer.ts";

export type DeployTermination = "eject" | "plan" | "apply";

export interface RunDeployOptions {
  artifacts: KitSdk.Deploy.ArtifactsSource;
  /** Which released version `${release.<name>}` resolves to for published artifacts — meaningless for local artifacts, where the local tag is always used regardless. */
  version: string;
  termination: DeployTermination;
  acceptCapabilityGaps: boolean;
  /** Run the kit's long-lived watch command instead of a one-shot apply, torn down cleanly on SIGINT. Ignored by `eject`/`plan`. */
  watch: boolean;
  /** Pack the referenced releases before a local apply. `true` by default; ignored for published artifacts. */
  pack: boolean;
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

  const outputsDir = join(repoRoot, "source", "artifacts", "deploy", name);
  const sink = new KitSdk.Deploy.Terminations.FileArtifactSink(outputsDir);
  const cache = new KitSdk.Deploy.Terminations.FileRenderCache(
    join(repoRoot, ".ensemble", "deploy", name, "last-rendered.txt"),
  );

  const coordinator = new KitSdk.Deploy.Terminations.DeploymentCoordinator(
    registry,
    renderer,
    new KitSdk.Deploy.Terminations.Ejector(sink),
    new KitSdk.Deploy.Terminations.Planner(cache),
    new KitSdk.Deploy.Terminations.Applier(sink, cache),
    new KitSdk.Deploy.Terminations.ReleaseAvailabilityPreflight(gateway),
    new KitSdk.Deploy.Terminations.LocalArtifactsPacker(
      new RunPackReleasePacker(),
    ),
    new KitSdk.Deploy.Terminations.WatchRunner(sink),
  );

  const result = await coordinator.deploy(name, workload, target, {
    artifacts: options.artifacts,
    termination: options.termination,
    acceptCapabilityGaps: options.acceptCapabilityGaps,
    version: options.version,
    pack: options.pack,
    watch: options.watch,
  });

  for (const report of result.gaps) {
    console.warn(
      `warning: capability "${report.gap.capability}" unmet by kit "${kit}" on ${report.resource} (requested ${report.gap.requested}) — accepted.`,
    );
  }

  presentResult(result, name, options.watch);
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
