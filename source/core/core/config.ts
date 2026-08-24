import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";

export interface BuildAppConfig {
  kit: string;
}

export interface EnsembleConfig {
  build?: Record<string, BuildAppConfig>;
}

export type VarKind = "build" | "pack";

export interface LocalEnsembleConfig {
  vars?: Record<VarKind, Record<string, Record<string, string>>>;
}

/**
 * Reads and writes .ensemble/config.yaml and its gitignored per-developer
 * counterpart .ensemble/config.local.yaml — constructed once with `repoRoot`
 * so every operation doesn't need to re-derive the same paths.
 */
export class EnsembleConfigStore {
  constructor(private readonly repoRoot: string) {}

  private get configPath(): string {
    return join(this.repoRoot, ".ensemble", "config.yaml");
  }

  private get localConfigPath(): string {
    return join(this.repoRoot, ".ensemble", "config.local.yaml");
  }

  async load(): Promise<EnsembleConfig> {
    const path = this.configPath;
    if (!await exists(path, { isFile: true })) {
      throw new Error(`Ensemble config not found at ${path}`);
    }
    const parsed = parseYaml(await Deno.readTextFile(path));
    return (parsed ?? {}) as EnsembleConfig;
  }

  /**
   * Loads .ensemble/config.local.yaml, the gitignored counterpart to
   * config.yaml for per-developer defaults (e.g. build/pack var overrides you
   * don't want to share with the team). Returns an empty config if the file
   * doesn't exist, unlike load() which requires config.yaml to be present.
   */
  async loadLocal(): Promise<LocalEnsembleConfig> {
    const path = this.localConfigPath;
    if (!await exists(path, { isFile: true })) {
      return {};
    }
    const parsed = parseYaml(await Deno.readTextFile(path));
    return (parsed ?? {}) as LocalEnsembleConfig;
  }

  /** Returns the locally configured default vars for a given app/ship name, or {} if none are set. */
  getVars(config: LocalEnsembleConfig, kind: VarKind, name: string): Record<string, string> {
    return config.vars?.[kind]?.[name] ?? {};
  }

  /**
   * Sets vars.<kind>.<name>.<key> in .ensemble/config.local.yaml, creating the
   * file if it doesn't exist yet and preserving any other existing entries.
   * This is a plain parse-modify-rewrite of the YAML, so any hand-written
   * comments in an existing config.local.yaml are not preserved across this call.
   */
  async setVar(kind: VarKind, name: string, key: string, value: string): Promise<void> {
    const existingConfig = await this.loadLocal();

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
    await Deno.writeTextFile(this.localConfigPath, stringifyYaml(config as unknown as Record<string, unknown>));
  }

  getAppBuildConfig(config: EnsembleConfig, name: string): BuildAppConfig {
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
  async setAppBuildKit(appName: string, kit: string): Promise<void> {
    const kitEntry = join(this.repoRoot, ".ensemble", "kits", "build", kit, "main.ts");
    if (!await exists(kitEntry, { isFile: true })) {
      throw new Error(`Build kit "${kit}" not found (expected ${kitEntry})`);
    }

    const path = this.configPath;
    const existingConfig: EnsembleConfig = await exists(path, { isFile: true })
      ? ((parseYaml(await Deno.readTextFile(path)) ?? {}) as EnsembleConfig)
      : {};

    const config: EnsembleConfig = {
      ...existingConfig,
      build: { ...existingConfig.build, [appName]: { kit } },
    };
    await Deno.writeTextFile(path, stringifyYaml(config as unknown as Record<string, unknown>));
  }
}
