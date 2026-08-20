import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";

export interface BuildAppConfig {
  kit: string;
}

export interface EnsembleConfig {
  build?: Record<string, BuildAppConfig>;
}

export async function loadConfig(repoRoot: string): Promise<EnsembleConfig> {
  const path = join(repoRoot, ".ensemble", "config.yaml");
  if (!await exists(path, { isFile: true })) {
    throw new Error(`Ensemble config not found at ${path}`);
  }
  const parsed = parseYaml(await Deno.readTextFile(path));
  return (parsed ?? {}) as EnsembleConfig;
}

export type VarKind = "build" | "pack";

export interface LocalEnsembleConfig {
  vars?: Record<VarKind, Record<string, Record<string, string>>>;
}

function localConfigPath(repoRoot: string): string {
  return join(repoRoot, ".ensemble", "config.local.yaml");
}

/**
 * Loads .ensemble/config.local.yaml, the gitignored counterpart to
 * config.yaml for per-developer defaults (e.g. build/pack var overrides you
 * don't want to share with the team). Returns an empty config if the file
 * doesn't exist, unlike loadConfig which requires config.yaml to be present.
 */
export async function loadLocalConfig(repoRoot: string): Promise<LocalEnsembleConfig> {
  const path = localConfigPath(repoRoot);
  if (!await exists(path, { isFile: true })) {
    return {};
  }
  const parsed = parseYaml(await Deno.readTextFile(path));
  return (parsed ?? {}) as LocalEnsembleConfig;
}

/** Returns the locally configured default vars for a given app/ship name, or {} if none are set. */
export function getLocalVars(
  config: LocalEnsembleConfig,
  kind: VarKind,
  name: string,
): Record<string, string> {
  return config.vars?.[kind]?.[name] ?? {};
}

/**
 * Sets vars.<kind>.<name>.<key> in .ensemble/config.local.yaml, creating the
 * file if it doesn't exist yet and preserving any other existing entries.
 * This is a plain parse-modify-rewrite of the YAML, so any hand-written
 * comments in an existing config.local.yaml are not preserved across this call.
 */
export async function setLocalVar(
  repoRoot: string,
  kind: VarKind,
  name: string,
  key: string,
  value: string,
): Promise<void> {
  const path = localConfigPath(repoRoot);
  const existingConfig = await loadLocalConfig(repoRoot);

  const config: LocalEnsembleConfig = {
    ...existingConfig,
    vars: {
      ...existingConfig.vars,
      [kind]: {
        ...existingConfig.vars?.[kind],
        [name]: { ...existingConfig.vars?.[kind]?.[name], [key]: value },
      },
    } as Record<VarKind, Record<string, Record<string, string>>>,
  };
  await Deno.writeTextFile(path, stringifyYaml(config as unknown as Record<string, unknown>));
}

export function getAppBuildConfig(config: EnsembleConfig, name: string): BuildAppConfig {
  const appConfig = config.build?.[name];
  if (!appConfig) {
    throw new Error(
      `No build configuration found for app "${name}" ` +
        `(expected a "build.${name}.kit" entry in .ensemble/config.yaml)`,
    );
  }
  if (!appConfig.kit) {
    throw new Error(`App "${name}" is missing a "kit" property in .ensemble/config.yaml`);
  }
  return appConfig;
}

/**
 * Sets build.<appName>.kit in .ensemble/config.yaml, creating the file if it
 * doesn't exist yet and preserving any other existing entries. This is a
 * plain parse-modify-rewrite of the YAML, so any hand-written comments in an
 * existing config.yaml are not preserved across this call.
 */
export async function setAppBuildKit(repoRoot: string, appName: string, kit: string): Promise<void> {
  const kitEntry = join(repoRoot, ".ensemble", "kits", "build", kit, "main.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    throw new Error(`Build kit "${kit}" not found (expected ${kitEntry})`);
  }

  const path = join(repoRoot, ".ensemble", "config.yaml");
  const existingConfig: EnsembleConfig = await exists(path, { isFile: true })
    ? ((parseYaml(await Deno.readTextFile(path)) ?? {}) as EnsembleConfig)
    : {};

  const config: EnsembleConfig = {
    ...existingConfig,
    build: { ...existingConfig.build, [appName]: { kit } },
  };
  await Deno.writeTextFile(path, stringifyYaml(config as unknown as Record<string, unknown>));
}
