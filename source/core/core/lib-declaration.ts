import { join } from "@std/path";
import { EnsembleConfigStore, type LibConfig } from "./config.ts";

/** One `publish:` entry for a lib — the kit to publish through and, only for a kit with more than one named destination, which one. */
export interface PublishEntry {
  readonly kit: string;
  readonly target?: string;
}

/** A library's resolved declaration — the package name it publishes under and every kit/target it publishes through. */
export interface LibDeclaration {
  readonly package: string;
  readonly publish: readonly PublishEntry[];
}

function toDeclaration(configKey: "libs" | "coreLibs", name: string, libConfig: LibConfig): LibDeclaration {
  if (!libConfig.package) {
    throw new Error(
      `"${configKey}.${name}" in .ensemble/config.yaml is missing a "package" name.`,
    );
  }
  return {
    package: libConfig.package,
    publish: (libConfig.publish ?? []).map(({ kit, target }) => ({ kit, target })),
  };
}

/**
 * Resolves lib declarations from `.ensemble/config.yaml` — never from a
 * manifest inside the library's own directory, so a library never carries
 * ensemble-CLI-only tooling metadata alongside its real exports. A
 * `source/libs/<name>` library is looked up by name under `libs:` (`load`,
 * the same way `ens build` looks up `build.<name>`); every `source/core/**`
 * library is discovered under `coreLibs:` (`discoverCoreLibs`), mirroring
 * how `ReleaseCeremony.collectShipReleases` globs `ci/<name>/delivery.yml`.
 */
export class LibDeclarationLoader {
  constructor(private readonly repoRoot: string) {}

  /** Looks up `libs.<name>` — the declaration for a `source/libs/<name>` library. */
  async load(name: string): Promise<LibDeclaration> {
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    const libConfig = config.libs?.[name];
    if (!libConfig) {
      throw new Error(
        `No lib configuration found for "${name}" ` +
          `(expected a "libs.${name}.package" entry in .ensemble/config.yaml)`,
      );
    }
    return toDeclaration("libs", name, libConfig);
  }

  /** Every entry under `coreLibs:` in `.ensemble/config.yaml`, resolved against `source/core/<name>`. A repo with no config.yaml yet, or no `coreLibs:` key, simply discovers nothing. */
  async discoverCoreLibs(): Promise<
    { libRoot: string; declaration: LibDeclaration }[]
  > {
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    return Object.entries(config.coreLibs ?? {}).map(([name, libConfig]) => ({
      libRoot: join(this.repoRoot, "source", "core", name),
      declaration: toDeclaration("coreLibs", name, libConfig),
    }));
  }
}
