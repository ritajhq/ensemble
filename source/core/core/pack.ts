import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import { loadKitModes } from "@ensemble/kit-sdk";
import { getLocalVars, loadLocalConfig } from "./config.ts";

export interface RunPackOptions {
  /** Defaults to the first mode declared in the kit's kit.yml, or "default" if it has none. */
  mode?: string;
  /** Name to give the packed output. Defaults to the ship name. */
  outputName?: string;
  varOverrides?: Record<string, string>;
}

/** Resolves a pack kit by name and spawns it with the standard pack kit CLI contract. */
export async function runPack(
  shipName: string,
  kit: string,
  options: RunPackOptions,
): Promise<number> {
  const repoRoot = await findRepoRoot();
  const workspace = join(repoRoot, "source");

  const kitDir = join(repoRoot, ".ensemble", "kits", "pack", kit);
  const kitEntry = join(kitDir, "main.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    throw new Error(`Pack kit "${kit}" not found (expected ${kitEntry})`);
  }

  const shipDir = join(workspace, "ship", shipName);
  if (!await exists(shipDir, { isDirectory: true })) {
    throw new Error(`Ship source not found at ${shipDir}`);
  }

  let mode = options.mode;
  const kitManifest = join(kitDir, "kit.yml");
  if (await exists(kitManifest, { isFile: true })) {
    const modes = await loadKitModes(kitDir);
    const [firstMode] = Object.keys(modes);
    if (!firstMode) {
      throw new Error(`Kit manifest at ${kitManifest} declares an empty "modes" map.`);
    }
    mode ??= firstMode;
    if (!Object.hasOwn(modes, mode)) {
      const available = Object.keys(modes).join(", ");
      throw new Error(`Unknown mode "${mode}" for pack kit "${kit}". Available modes: ${available}`);
    }
  } else {
    mode ??= "default";
  }

  const artifactsDir = join(workspace, "artifacts");
  const packagesDir = join(artifactsDir, "packages");
  await ensureDir(packagesDir);

  const denoExe = await resolveDenoExecutable();

  const outputNameArgs = options.outputName ? ["--output-name", options.outputName] : [];

  const envFile = join(workspace, "envs", "pack", `${shipName}.env`);
  const fileVars = await loadEnv({ envPath: envFile, export: false });
  const localConfig = await loadLocalConfig(repoRoot);
  const localVars = getLocalVars(localConfig, "pack", shipName);
  const packVars = { ...fileVars, ...localVars, ...options.varOverrides };

  const result = await $`${denoExe} run -A -q ${kitEntry}
    --artifacts ${artifactsDir}
    --packages ${packagesDir}
    --name ${shipName}
    --mode ${mode}
    --vars ${JSON.stringify(packVars)}
    ${outputNameArgs}
    ${shipDir}`
    .cwd(kitDir)
    .env(packVars)
    .noThrow();

  return result.code;
}
