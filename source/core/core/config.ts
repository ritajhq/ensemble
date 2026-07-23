import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";

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
