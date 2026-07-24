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
