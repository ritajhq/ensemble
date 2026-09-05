import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import * as KitSdk from "@ensemble/kit-sdk";
import { EnsembleConfigStore } from "./config.ts";
import { ArtifactDependencyTracker } from "./artifact-dependencies.ts";

export interface RunPackOptions {
  /** Defaults to the first mode declared in the kit's kit.yml, or "default" if it has none. */
  mode?: string;
  /** Name to give the packed output. Defaults to the ship name. */
  outputName?: string;
  /** Repack on source changes. Only meaningful for kits that declare watch support (e.g. deno.compile) — an unsupporting kit just ignores the flag. */
  watch?: boolean;
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

  const resultFile = await Deno.makeTempFile({
    prefix: "ensemble-pack-result-",
  });
  try {
    // --minimum-dependency-age 0: see the identical flag in build.ts.
    const result = await $`${denoExe} run -A -q --minimum-dependency-age 0 ${kitEntry}
      --artifacts ${artifactsDir}
      --packages ${packagesDir}
      --name ${shipName}
      --mode ${mode}
      --vars ${JSON.stringify(packVars)}
      --apps ${JSON.stringify(apps)}
      --result-file ${resultFile}
      ${outputNameArgs}
      ${watchArgs}
      ${shipDir}`
      .cwd(kitDir)
      .env(packVars)
      .noThrow();

    if (result.code !== 0) {
      return result.code;
    }

    const reported = await readKitResult(resultFile);
    if (reported) {
      const tracker = new ArtifactDependencyTracker(artifactsDir, config);
      await tracker.Resolve(shipName, reported.artifacts);
    }

    return result.code;
  } finally {
    await Deno.remove(resultFile).catch(() => {});
  }
}

/** Reads a kit's Result from its --result-file, or undefined if the kit didn't write one. */
async function readKitResult(
  resultFile: string,
): Promise<KitSdk.Pack.Result | undefined> {
  let text: string;
  try {
    text = await Deno.readTextFile(resultFile);
  } catch {
    return undefined;
  }
  if (text.length === 0) return undefined;
  return JSON.parse(text) as KitSdk.Pack.Result;
}
