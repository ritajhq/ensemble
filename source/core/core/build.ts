import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import type { Ports } from "./ports.ts";
import { type BuildAppConfig, EnsembleConfigStore } from "./config.ts";
import type * as Build from "./build-context.ts";
import type { BuildReporter } from "./build-reporter.ts";
import { PlainBuildReporter } from "./plain-build-reporter.ts";
import {
  integrationKitsOf,
  integrationOf,
  isIntegration,
  isReserved,
  sourceDirOf,
} from "./deploy/integration.ts";
import { Project } from "./ecosystem/index.ts";
import { KitProcess } from "./kit-process.ts";

export interface RunBuildOptions {
  mode: Build.Mode;
  watch: boolean;
  varOverrides?: Record<string, string>;
  /** Aborting this stops the spawned build kit process — meaningful mainly with `watch: true`, which otherwise runs until killed. Used by `runDeploy`'s development-mode build-watcher orchestration to shut every watcher down once the deploy itself ends. */
  signal?: AbortSignal;
  /** Apps not to build again, because they're fresh already or something else keeps them so. Each app this run builds successfully is added, so a caller building several shares one set. */
  built?: Set<string>;
  /** How to report this build's lifecycle to the terminal — ignored for `watch: true` (a long-lived session has no single "done" moment to resolve toward). Defaults to `PlainBuildReporter`; the CLI passes `Host.AnimatedBuildReporter` instead for an interactive terminal. */
  reporter?: BuildReporter;
}

/** The order `name`'s `needs:` must be built in, deepest first, without `name` itself. */
function prerequisitesOf(
  name: string,
  build: Record<string, BuildAppConfig>,
): string[] {
  const ordered: string[] = [];
  const visit = (app: string, path: readonly string[]): void => {
    for (const need of build[app]?.needs ?? []) {
      if (path.includes(need)) {
        throw new Error(
          `Build needs form a cycle: ${[...path, need].join(" -> ")}.`,
        );
      }
      visit(need, [...path, need]);
      if (!ordered.includes(need)) ordered.push(need);
    }
  };
  visit(name, [name]);
  return ordered;
}

/**
 * Builds what `name` names, after whatever it declares it `needs:`: only
 * `name` itself watches, since a needed app has to be there before it starts.
 * The code is the first failure's, or 0.
 */
export async function runBuild(
  name: string,
  options: RunBuildOptions,
  ports: Ports,
): Promise<number> {
  const repoRoot = await ports.repo.findRepoRoot();
  const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();
  // A caller sharing `built` across several builds has synced already.
  if (!options.built) await (await Project.load(repoRoot, ports)).sync();
  const built = options.built ?? new Set<string>();
  for (const need of prerequisitesOf(name, config.build ?? {})) {
    if (built.has(need)) continue;
    const code = await buildNamed(need, { ...options, watch: false }, ports);
    if (code !== 0) return code;
    built.add(need);
  }
  if (built.has(name)) return 0;
  const code = await buildNamed(name, options, ports);
  if (code === 0) built.add(name);
  return code;
}

/**
 * Builds what `name` names: an app — as itself, or, when it's a library
 * declared with `integrations`, every one of them — or one integration
 * (`integrations/<kit>/<app>`, see `./deploy/integration.ts`), which is what a
 * development session keeps built for the kit deploying. Each unit runs its
 * configured kit with the standard kit CLI contract; a watch runs them side
 * by side, a one-shot build one after the other. The code is the first unit's
 * that fails, or 0.
 */
async function buildNamed(
  name: string,
  options: RunBuildOptions,
  ports: Ports,
): Promise<number> {
  const repoRoot = await ports.repo.findRepoRoot();
  if (isReserved(name) && !isIntegration(name)) {
    throw new Error(
      `"${name}" is under integrations/, which names integrations (integrations/<kit>/<app>), never apps.`,
    );
  }
  const units = isIntegration(name)
    ? [name]
    : (await integrationKitsOf(repoRoot, name)).map((kit) =>
      integrationOf(name, kit)
    );
  if (units.length === 0) return await runUnit(name, options, ports);
  if (options.watch) {
    const codes = await Promise.all(
      units.map((unit) => runUnit(unit, options, ports)),
    );
    return codes.find((code) => code !== 0) ?? 0;
  }
  for (const unit of units) {
    const code = await runUnit(unit, options, ports);
    if (code !== 0) return code;
  }
  return 0;
}

/** Spawns the kit that builds one unit — an app, or one integration. */
async function runUnit(
  name: string,
  options: RunBuildOptions,
  ports: Ports,
): Promise<number> {
  const repoRoot = await ports.repo.findRepoRoot();
  const workspace = join(repoRoot, "source");

  const sourceDir = sourceDirOf(workspace, name);
  if (!await exists(sourceDir, { isDirectory: true })) {
    throw new Error(
      `App "${name}" does not exist (expected a directory at ${sourceDir})`,
    );
  }

  const configStore = new EnsembleConfigStore(repoRoot);
  const config = await configStore.load();
  const appConfig = configStore.getUnitBuildConfig(config, name);

  const kitDir = join(repoRoot, ".ensemble", "kits", "build", appConfig.kit);
  const kitEntry = join(kitDir, "main.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    throw new Error(
      `Build kit "${appConfig.kit}" not found (expected ${kitEntry})`,
    );
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
  const optionsArgs = appConfig.options
    ? ["--options", JSON.stringify(appConfig.options)]
    : [];

  const progress = options.watch
    ? undefined
    : (options.reporter ?? new PlainBuildReporter()).building(name);

  const code = await new KitProcess(kitDir, ports).run(
    "main.ts",
    [
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
      ...optionsArgs,
    ],
    { env: buildVars, signal: options.signal },
  );

  if (code === 0) progress?.succeed();
  else progress?.fail();

  return code;
}
