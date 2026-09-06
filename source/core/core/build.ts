import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $, KillSignalController } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { EnsembleConfigStore } from "./config.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import { BuildCache } from "./build-cache.ts";
import type * as KitSdk from "@ensemble/kit-sdk";

export interface RunBuildOptions {
  mode: KitSdk.Build.Mode;
  watch: boolean;
  varOverrides?: Record<string, string>;
  /** Aborting this stops the spawned build kit process — meaningful mainly with `watch: true`, which otherwise runs until killed. Used by `runDeploy`'s development-mode build-watcher orchestration to shut every watcher down once the deploy itself ends. */
  signal?: AbortSignal;
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

  const buildCache = new BuildCache();
  if (!options.watch && await buildCache.isUpToDate(sourceDir, outDir, options.mode, buildVars)) {
    console.log(`${name} is up to date, skipping build`);
    return 0;
  }

  const watchArgs = options.watch ? ["--watch"] : [];
  const targetArgs = appConfig.target ? ["--target", appConfig.target] : [];
  const denoExe = await resolveDenoExecutable();

  const killSignal = new KillSignalController();
  if (options.signal) {
    if (options.signal.aborted) killSignal.kill();
    else options.signal.addEventListener("abort", () => killSignal.kill());
  }

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

  if (result.code === 0 && !options.watch) {
    await buildCache.recordBuilt(sourceDir, outDir, options.mode, buildVars);
  }

  return result.code;
}
