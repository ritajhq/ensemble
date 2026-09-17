import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import type { Ports } from "./ports.ts";
import * as Pack from "./pack-context.ts";
import { EnsembleConfigStore } from "./config.ts";
import { runBuild } from "./build.ts";
import { resolvePackDependencies } from "./pack-dependencies.ts";
import type { PackReporter } from "./pack-reporter.ts";
import { PlainPackReporter } from "./plain-pack-reporter.ts";

export interface RunPackOptions {
  /** Defaults to the first mode declared in the kit's kit.yml, or "default" if it has none. */
  mode?: string;
  /** Name to give the packed output. Defaults to the ship name. */
  outputName?: string;
  /** Repack on source changes. Only meaningful for kits that declare watch support (e.g. deno.compile) — an unsupporting kit just ignores the flag. */
  watch?: boolean;
  varOverrides?: Record<string, string>;
  /**
   * Apps to leave out of the automatic pre-build step even if this ship
   * depends on them — for when something else is already responsible for
   * keeping their build output fresh (`ens develop`'s companion `ens build
   * --watch` loop, started once per deploy and long-lived, would otherwise
   * race this function's own one-shot build of the very same app). Defaults
   * to none, i.e. every resolved dependency gets built here.
   */
  skipBuildingApps?: ReadonlySet<string>;
  /** Let the kit's own build tool print its normal output (e.g. `docker buildx build`'s progress log) instead of hiding it behind the pack spinner. `false` by default. */
  verbose?: boolean;
  /** How to report this pack's lifecycle to the terminal — ignored for `watch: true` or `verbose: true` (both have nothing sensible for a spinner to resolve against: a `--watch` kit never exits, and verbose output competes with it for the same line). Defaults to `PlainPackReporter`; the CLI passes `Host.AnimatedPackReporter` instead for an interactive terminal. */
  reporter?: PackReporter;
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
  ports: Ports,
): Promise<number> {
  const repoRoot = await ports.repo.findRepoRoot();
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
    ? await Pack.loadModes(kitDir)
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

  const denoExe = await ports.denoExe.resolveDenoExecutable();

  const outputNameArgs = options.outputName ? ["--output-name", options.outputName] : [];
  const watchArgs = options.watch ? ["--watch"] : [];
  const verboseArgs = options.verbose ? ["--verbose"] : [];

  const envFile = join(workspace, "envs", "pack", `${shipName}.env`);
  const fileVars = await loadEnv({ envPath: envFile, export: false });
  const config = new EnsembleConfigStore(repoRoot);
  const localConfig = await config.loadLocal();
  const localVars = config.getVars(localConfig, "pack", shipName);
  const packVars = { ...fileVars, ...localVars, ...options.varOverrides };

  const ensembleConfig = await config.load();
  const apps = Object.keys(ensembleConfig.build ?? {});

  const dependencies = await resolvePackDependencies(shipName, kit, apps, ports);
  for (const app of dependencies) {
    if (options.skipBuildingApps?.has(app)) continue;
    const buildCode = await runBuild(app, { mode: "production", watch: false }, ports);
    if (buildCode !== 0) {
      return buildCode;
    }
  }

  const progress = options.watch || options.verbose
    ? undefined
    : (options.reporter ?? new PlainPackReporter()).packing(shipName);

  // --minimum-dependency-age 0: see the identical flag in build.ts.
  const code = await ports.process.run(
    denoExe,
    [
      "run",
      "-A",
      "-q",
      "--minimum-dependency-age",
      "0",
      kitEntry,
      "--artifacts",
      artifactsDir,
      "--packages",
      packagesDir,
      "--name",
      shipName,
      "--mode",
      mode,
      "--vars",
      JSON.stringify(packVars),
      "--apps",
      JSON.stringify(apps),
      ...outputNameArgs,
      ...watchArgs,
      ...verboseArgs,
      shipDir,
    ],
    { cwd: kitDir, env: packVars },
  );

  if (code === 0) progress?.succeed();
  else progress?.fail();

  return code;
}
