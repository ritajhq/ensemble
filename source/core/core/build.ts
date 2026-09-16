import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import type { Ports } from "./ports.ts";
import { EnsembleConfigStore } from "./config.ts";
import type * as Build from "./build-context.ts";
import type { BuildReporter } from "./build-reporter.ts";
import { PlainBuildReporter } from "./plain-build-reporter.ts";

export interface RunBuildOptions {
  mode: Build.Mode;
  watch: boolean;
  varOverrides?: Record<string, string>;
  /** Aborting this stops the spawned build kit process — meaningful mainly with `watch: true`, which otherwise runs until killed. Used by `runDeploy`'s development-mode build-watcher orchestration to shut every watcher down once the deploy itself ends. */
  signal?: AbortSignal;
  /** How to report this build's lifecycle to the terminal — ignored for `watch: true` (a long-lived session has no single "done" moment to resolve toward). Defaults to `PlainBuildReporter`; the CLI passes `Host.AnimatedBuildReporter` instead for an interactive terminal. */
  reporter?: BuildReporter;
}

/** Resolves an app's configured kit and spawns it with the standard kit CLI contract. */
export async function runBuild(name: string, options: RunBuildOptions, ports: Ports): Promise<number> {
  const repoRoot = await ports.repo.findRepoRoot();
  const workspace = join(repoRoot, "source");

  const sourceDir = join(workspace, "apps", name);
  if (!await exists(sourceDir, { isDirectory: true })) {
    throw new Error(`App "${name}" does not exist (expected a directory at ${sourceDir})`);
  }

  const configStore = new EnsembleConfigStore(repoRoot);
  const config = await configStore.load();
  const appConfig = configStore.getAppBuildConfig(config, name);

  const kitDir = join(repoRoot, ".ensemble", "kits", "build", appConfig.kit);
  const kitEntry = join(kitDir, "main.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    throw new Error(`Build kit "${appConfig.kit}" not found (expected ${kitEntry})`);
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
  const denoExe = await ports.denoExe.resolveDenoExecutable();

  const progress = options.watch
    ? undefined
    : (options.reporter ?? new PlainBuildReporter()).building(name);

  // --minimum-dependency-age 0: this project's own kits depend on
  // @ensemble/*/@duesabati/* first-party packages, which Deno's default 24h
  // minimum dependency age (a supply-chain mitigation aimed at unfamiliar
  // third-party deps) would otherwise block from resolving right after a
  // fresh release — scoped to just this invocation, not the user's own
  // project-wide deno.json policy.
  const code = await ports.process.run(
    denoExe,
    [
      "run",
      "-A",
      "-q",
      "--minimum-dependency-age",
      "0",
      kitEntry,
      "--source",
      sourceDir,
      "--name",
      name,
      "--out",
      outDir,
      "--mode",
      options.mode,
      "--workspace",
      workspace,
      "--vars",
      JSON.stringify(buildVars),
      ...watchArgs,
      ...targetArgs,
    ],
    { cwd: kitDir, env: buildVars, signal: options.signal },
  );

  if (code === 0) progress?.succeed();
  else progress?.fail();

  return code;
}
