import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";

export interface BuildAppConfig {
  kit: string;
  /** Static, kit-interpreted build variant (e.g. "ssr" for the `react` kit) — a fact about what the app is, not a per-run override, so it lives here rather than as a `-v` var. */
  target?: string;
}

/** A named shell command, so `ens` can announce which hook is running without printing its whole script. */
export interface HookConfig {
  name: string;
  run: string;
}

/** Shell commands `ens` runs at defined points in its own lifecycle, configured under the top-level `hooks:` key. */
export interface HooksConfig {
  release?: {
    /** Runs at the repo root right after a release completes (see @ensemble/core's Hooks), in order — e.g. to regenerate a changelog. Gets the released tag in `$ENSEMBLE_RELEASE_TAG`. */
    after?: HookConfig[];
  };
}

/** One `publish:` entry for a lib — the kit to publish through and, only for a kit with more than one named destination, which one. */
export interface LibPublishEntry {
  kit: string;
  target?: string;
}

/**
 * A lib's declaration — its name (resolved against `source/libs/<name>` for
 * a portable library, `source/core/<name>` for a core one), the package
 * name it publishes under, and where it publishes — tracked purely as
 * tooling config, the same way `BuildAppConfig` tracks an app's build kit
 * rather than the app declaring it internally. Never written inside the
 * library's own directory: entries live in the top-level `publish.libs`
 * list for a portable library, `publish.core` for a core one.
 */
export interface LibConfig {
  name: string;
  package: string;
  publish?: LibPublishEntry[];
}

/** Every library `ens` knows how to release, grouped by kind under the top-level `publish:` key. */
export interface PublishConfig {
  core?: LibConfig[];
  libs?: LibConfig[];
}

export interface EnsembleConfig {
  build?: Record<string, BuildAppConfig>;
  hooks?: HooksConfig;
  publish?: PublishConfig;
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

  /** Loads config.yaml, or {} if it doesn't exist yet — unlike load(), which requires it. */
  async loadOrEmpty(): Promise<EnsembleConfig> {
    return await exists(this.configPath, { isFile: true }) ? await this.load() : {};
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
   * Sets build.<appName>.kit (and, if given, .target) in .ensemble/config.yaml,
   * creating the file if it doesn't exist yet and preserving any other
   * existing entries. This is a plain parse-modify-rewrite of the YAML, so
   * any hand-written comments in an existing config.yaml are not preserved
   * across this call.
   */
  async setAppBuildKit(appName: string, kit: string, target?: string): Promise<void> {
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
      build: { ...existingConfig.build, [appName]: target ? { kit, target } : { kit } },
    };
    await Deno.writeTextFile(path, stringifyYaml(config as unknown as Record<string, unknown>));
  }

  /**
   * Sets the `package` of the `publish.libs[]` entry named `name` in
   * .ensemble/config.yaml (adding the entry if none exists yet), creating
   * the file if it doesn't exist and preserving any other existing entries
   * (including a pre-existing entry's `.publish` list) — so a scaffolded or
   * installed lib is immediately known without hand-editing config.yaml.
   */
  async setLibPackage(name: string, packageName: string): Promise<void> {
    const path = this.configPath;
    const existingConfig: EnsembleConfig = await exists(path, { isFile: true })
      ? ((parseYaml(await Deno.readTextFile(path)) ?? {}) as EnsembleConfig)
      : {};

    const libs = existingConfig.publish?.libs ?? [];
    const existingEntry = libs.find((lib) => lib.name === name);
    const updatedEntry: LibConfig = { ...existingEntry, name, package: packageName };

    const config: EnsembleConfig = {
      ...existingConfig,
      publish: {
        ...existingConfig.publish,
        libs: existingEntry
          ? libs.map((lib) => (lib.name === name ? updatedEntry : lib))
          : [...libs, updatedEntry],
      },
    };
    await Deno.writeTextFile(path, stringifyYaml(config as unknown as Record<string, unknown>));
  }
}
