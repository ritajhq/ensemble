import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "./repo.ts";
import { runBuild } from "./build.ts";

export type DeployAction = "up" | "down";

/**
 * "development" bundles the two behaviors that only ever make sense
 * together for a local dev-loop deploy — watch mode (syncing local build
 * output into the running container) and treating `external` entries as
 * auto-creatable local conveniences rather than genuinely external (must
 * already exist) — into one concept, mirroring `ens build`'s own
 * `-m/--mode`. `ens develop` is just `runDeploy(..., { mode: "development" })`.
 */
export type DeployMode = "development" | "production";

export interface RunDeployOptions {
  action: DeployAction;
  /** Defaults to "production" — a plain `ens deploy` is a real deploy unless told otherwise. Meaningless for "down". */
  mode?: DeployMode;
  /** Which released version to resolve `${release.<name>.image}` references to — defaults to "latest" (whatever's packed locally), independent of `mode`: a development-mode deploy can still pin a specific published version. Meaningless for "down". */
  version?: string;
}

/**
 * Resolves a deployment's workload manifest and deploy kit by name, and runs
 * the requested action. Unlike build/pack kits (spawned as subprocesses with
 * a CLI-flag contract), a deploy kit is imported in-process: its `main.ts`
 * default-exports a configured `KitSdk.Deploy.Kit` instance, which this
 * calls `Up`/`Down` on directly — see kit-sdk's kit.ts for why (the
 * translator contract is designed to be in-process-first).
 */
export async function runDeploy(
  name: string,
  kit: string,
  options: RunDeployOptions,
): Promise<void> {
  const repoRoot = await findRepoRoot();
  const workspace = join(repoRoot, "source");

  const manifestPath = join(repoRoot, "ci", name, "delivery.yml");
  if (!await exists(manifestPath, { isFile: true })) {
    throw new Error(`Delivery manifest not found at ${manifestPath}`);
  }

  const kitEntry = join(
    repoRoot,
    ".ensemble",
    "kits",
    "deploy",
    kit,
    "main.ts",
  );
  if (!await exists(kitEntry, { isFile: true })) {
    throw new Error(`Deploy kit "${kit}" not found (expected ${kitEntry})`);
  }

  const workload = await KitSdk.Deploy.parseWorkloadFile(manifestPath);
  const batches = KitSdk.Deploy.buildBatches(manifestPath, workload);

  const module = await import(`file://${kitEntry}`);
  const kitInstance = module.default;
  if (!(kitInstance instanceof KitSdk.Deploy.Kit)) {
    throw new Error(
      `Deploy kit "${kit}" (${kitEntry}) must default-export a KitSdk.Deploy.Kit instance.`,
    );
  }

  const volumePath = join(workspace, "artifacts", "deploy", name);
  await ensureDir(volumePath);

  const development = (options.mode ?? "production") === "development";
  const runOptions: KitSdk.Deploy.KitRunOptions = {
    watch: development,
    development,
    version: options.version ?? "latest",
  };
  const ctx: KitSdk.Deploy.KitContext = {
    volumePath: resolveDeployVolume(volumePath),
    artifactsPath: join(workspace, "artifacts"),
  };

  if (options.action !== "up") {
    await kitInstance.Down(workload, batches, runOptions, ctx);
    return;
  }

  if (!development) {
    await kitInstance.Up(workload, batches, runOptions, ctx);
    return;
  }

  // Development mode: a compute entry's `development.sync` only tells a kit
  // how to sync already-built artifacts into the running container — nothing
  // actually keeps regenerating those artifacts from source. Start a build
  // watcher for every app referenced this way, running concurrently with the
  // kit's own (also long-running, watch-mode) `Up`, and abort every watcher
  // once `Up` returns or throws so nothing outlives this `ens develop` run.
  const apps = collectDevelopmentSyncApps(workload);
  const buildAbort = new AbortController();
  const buildWatchers = apps.map((app) =>
    runBuild(app, { mode: "development", watch: true, signal: buildAbort.signal })
      .then((code) => {
        if (code !== 0 && !buildAbort.signal.aborted) {
          console.error(`build watcher for "${app}" exited with code ${code}`);
        }
      })
      .catch((error) => {
        console.error(
          `build watcher for "${app}" failed to start: ${error instanceof Error ? error.message : error}`,
        );
      })
  );

  try {
    await kitInstance.Up(workload, batches, runOptions, ctx);
  } finally {
    buildAbort.abort();
    await Promise.allSettled(buildWatchers);
  }
}

/** Every distinct app name a container compute entry's `development.sync` references, across the whole workload — what `ens develop` starts a build watcher for. */
function collectDevelopmentSyncApps(workload: KitSdk.Deploy.Workload): string[] {
  const apps = new Set<string>();
  for (const compute of Object.values(workload.compute ?? {})) {
    if (
      compute.type !== "container-orchestrated" &&
      compute.type !== "container-serverless"
    ) continue;
    for (const sync of compute.development?.sync ?? []) {
      apps.add(sync.app);
    }
  }
  return [...apps];
}

/** ENSEMBLE_DEPLOY_VOLUME overrides the default artifacts/deploy/<name>/ path, e.g. to point at a different tracked location. */
function resolveDeployVolume(defaultPath: string): string {
  return Deno.env.get("ENSEMBLE_DEPLOY_VOLUME") ?? defaultPath;
}
