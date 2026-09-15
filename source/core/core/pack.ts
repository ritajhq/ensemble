import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import * as KitSdk from "@ensemble/kit-sdk";
import { EnsembleConfigStore } from "./config.ts";
import { runBuild } from "./build.ts";
import { resolvePackDependencies } from "./pack-dependencies.ts";

export interface RunPackOptions {
  /** Defaults to the first mode declared in the kit's kit.yml, or "default" if it has none. */
  mode?: string;
  /** Name to give the packed output. Defaults to the ship name. */
  outputName?: string;
  /** Repack on source changes. Only meaningful for kits that declare watch support (e.g. deno.compile) — an unsupporting kit just ignores the flag. */
  watch?: boolean;
  varOverrides?: Record<string, string>;
}

/**
 * Resolves a pack kit by name and spawns it with the standard pack kit CLI
 * contract. Before that, asks the kit (via its `dependencies.ts`, if it has
 * one — see `resolvePackDependencies`) which of the ship's candidate apps it
 * actually depends on, and builds exactly those first, so the kit always
 * finds fresh build output waiting under `artifacts/` rather than requiring
 * it to have been built out of band beforehand.
 */
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
  const modes = await exists(kitManifest, { isFile: true })
    ? await KitSdk.Pack.loadModes(kitDir)
    : {};
  const declaredModes = Object.keys(modes);
  if (declaredModes.length > 0) {
    // A kit that declares modes: default to the first and validate against them.
    mode ??= declaredModes[0];
    if (!Object.hasOwn(modes, mode)) {
      throw new Error(`Unknown mode "${mode}" for pack kit "${kit}". Available modes: ${declaredModes.join(", ")}`);
    }
  } else {
    // A kit with no modes (e.g. deno.compile, driven by the ship's own config).
    mode ??= "default";
  }

  const artifactsDir = join(workspace, "artifacts");
  const packagesDir = join(artifactsDir, "packages");
  await ensureDir(packagesDir);

  const denoExe = await resolveDenoExecutable();

  const outputNameArgs = options.outputName ? ["--output-name", options.outputName] : [];
  const watchArgs = options.watch ? ["--watch"] : [];

  const envFile = join(workspace, "envs", "pack", `${shipName}.env`);
  const fileVars = await loadEnv({ envPath: envFile, export: false });
  const config = new EnsembleConfigStore(repoRoot);
  const localConfig = await config.loadLocal();
  const localVars = config.getVars(localConfig, "pack", shipName);
  const packVars = { ...fileVars, ...localVars, ...options.varOverrides };

  const ensembleConfig = await config.load();
  const apps = Object.keys(ensembleConfig.build ?? {});

  const dependencies = await resolvePackDependencies(shipName, kit, apps);
  for (const app of dependencies) {
    const buildCode = await runBuild(app, { mode: "production", watch: false });
    if (buildCode !== 0) {
      return buildCode;
    }
  }

  // --minimum-dependency-age 0: see the identical flag in build.ts.
  const result = await $`${denoExe} run -A -q --minimum-dependency-age 0 ${kitEntry}
    --artifacts ${artifactsDir}
    --packages ${packagesDir}
    --name ${shipName}
    --mode ${mode}
    --vars ${JSON.stringify(packVars)}
    --apps ${JSON.stringify(apps)}
    ${outputNameArgs}
    ${watchArgs}
    ${shipDir}`
    .cwd(kitDir)
    .env(packVars)
    .noThrow();

  return result.code;
}
