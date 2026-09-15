import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $, KillSignalController } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { EnsembleConfigStore } from "./config.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import type * as KitSdk from "@ensemble/kit-sdk";
import type { BuildReporter } from "./build-reporter.ts";
import { AnimatedBuildReporter } from "./animated-build-reporter.ts";

export interface RunBuildOptions {
  mode: KitSdk.Build.Mode;
  watch: boolean;
  varOverrides?: Record<string, string>;
  /** Aborting this stops the spawned build kit process — meaningful mainly with `watch: true`, which otherwise runs until killed. Used by `runDeploy`'s development-mode build-watcher orchestration to shut every watcher down once the deploy itself ends. */
  signal?: AbortSignal;
  /** How to report this build's lifecycle to the terminal — ignored for `watch: true` (a long-lived session has no single "done" moment to resolve toward). Defaults to `AnimatedBuildReporter`; a future `--plain` flag would pass `PlainBuildReporter` here instead. */
  reporter?: BuildReporter;
}

/** Resolves an app's configured kit and spawns it with the standard kit CLI contract. */
export async function runBuild(name: string, options: RunBuildOptions): Promise<number> {
  const repoRoot = await findRepoRoot();
  const workspace = join(repoRoot, "source");

  const configStore = new EnsembleConfigStore(repoRoot);
  const config = await configStore.load();
  const appConfig = configStore.getAppBuildConfig(config, name);

  const kitDir = join(repoRoot, ".ensemble", "kits", "build", appConfig.kit);
  const kitEntry = join(kitDir, "main.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    throw new Error(`Build kit "${appConfig.kit}" not found (expected ${kitEntry})`);
  }

  const sourceDir = join(workspace, "apps", name);
  if (!await exists(sourceDir, { isDirectory: true })) {
    throw new Error(`App source not found at ${sourceDir}`);
  }

  const outDir = join(workspace, "artifacts", name);
  await ensureDir(outDir);

  const envFile = join(workspace, "envs", "build", `${name}.env`);
  const fileVars = await loadEnv({ envPath: envFile, export: false });
  const localConfig = await configStore.loadLocal();
  const localVars = configStore.getVars(localConfig, "build", name);
  const buildVars = { ...fileVars, ...localVars, ...options.varOverrides };

  const watchArgs = options.watch ? ["--watch"] : [];
  const targetArgs = appConfig.target ? ["--target", appConfig.target] : [];
  const denoExe = await resolveDenoExecutable();

  const killSignal = new KillSignalController();
  const kill = () => {
    try {
      killSignal.kill();
    } catch {
      // Already exited on its own — nothing to tear down (same race
      // WatchRunner's own teardown guards against).
    }
  };
  if (options.signal) {
    if (options.signal.aborted) kill();
    else options.signal.addEventListener("abort", kill);
  }

  const progress = options.watch
    ? undefined
    : (options.reporter ?? new AnimatedBuildReporter()).building(name);

  // --minimum-dependency-age 0: this project's own kits depend on
  // @ensemble/*/@duesabati/* first-party packages, which Deno's default 24h
  // minimum dependency age (a supply-chain mitigation aimed at unfamiliar
  // third-party deps) would otherwise block from resolving right after a
  // fresh release — scoped to just this invocation, not the user's own
  // project-wide deno.json policy.
  const result = await $`${denoExe} run -A -q --minimum-dependency-age 0 ${kitEntry}
    --source ${sourceDir}
    --name ${name}
    --out ${outDir}
    --mode ${options.mode}
    --workspace ${workspace}
    --vars ${JSON.stringify(buildVars)}
    ${watchArgs}
    ${targetArgs}`
    .cwd(kitDir)
    .env(buildVars)
    .signal(killSignal.signal)
    .noThrow();

  if (result.code === 0) progress?.succeed();
  else progress?.fail();

  return result.code;
}
