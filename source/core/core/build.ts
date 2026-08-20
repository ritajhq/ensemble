import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { getAppBuildConfig, getLocalVars, loadConfig, loadLocalConfig } from "./config.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import type { BuildMode } from "@ensemble/kit-sdk";

export interface RunBuildOptions {
  mode: BuildMode;
  watch: boolean;
  varOverrides?: Record<string, string>;
}

/** Resolves an app's configured kit and spawns it with the standard kit CLI contract. */
export async function runBuild(name: string, options: RunBuildOptions): Promise<number> {
  const repoRoot = await findRepoRoot();
  const workspace = join(repoRoot, "source");

  const config = await loadConfig(repoRoot);
  const appConfig = getAppBuildConfig(config, name);

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
  const localConfig = await loadLocalConfig(repoRoot);
  const localVars = getLocalVars(localConfig, "build", name);
  const buildVars = { ...fileVars, ...localVars, ...options.varOverrides };

  const watchArgs = options.watch ? ["--watch"] : [];
  const denoExe = await resolveDenoExecutable();

  // --minimum-dependency-age 0: this project's own kits depend on
  // @ensemble/*/@ritaj/* first-party packages, which Deno's default 24h
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
    ${watchArgs}`
    .cwd(kitDir)
    .env(buildVars)
    .noThrow();

  return result.code;
}
