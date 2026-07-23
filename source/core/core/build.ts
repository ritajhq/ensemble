import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { getAppBuildConfig, loadConfig } from "./config.ts";
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
  const buildVars = { ...fileVars, ...options.varOverrides };

  const watchArgs = options.watch ? ["--watch"] : [];
  const denoExe = await resolveDenoExecutable();

  const result = await $`${denoExe} run -A ${kitEntry}
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
