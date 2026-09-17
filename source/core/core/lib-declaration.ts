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

function toDeclaration(configKey: "libs" | "core", libConfig: LibConfig): LibDeclaration {
  if (!libConfig.package) {
    throw new Error(
      `"publish.${configKey}" entry "${libConfig.name}" in .ensemble/config.yaml is missing a "package" name.`,
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
 * `source/libs/<name>` library is looked up by name under `publish.libs`
 * (`load`, the same way `ens build` looks up `build.<name>`); every
 * `source/core/**` library is discovered under `publish.core`
 * (`discoverCoreLibs`), mirroring how `ReleaseCeremony.collectShipReleases`
 * globs `ci/<name>/delivery.yml`.
 */
export class LibDeclarationLoader {
  constructor(private readonly repoRoot: string) {}

  /** Looks up the `publish.libs[]` entry named `name` — the declaration for a `source/libs/<name>` library. */
  async load(name: string): Promise<LibDeclaration> {
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    const libConfig = config.publish?.libs?.find((lib) => lib.name === name);
    if (!libConfig) {
      throw new Error(
        `No lib configuration found for "${name}" ` +
          `(expected a "publish.libs[]" entry named "${name}" in .ensemble/config.yaml)`,
      );
    }
    return toDeclaration("libs", libConfig);
  }

  /** Every entry under `publish.core:` in `.ensemble/config.yaml`, resolved against `source/core/<name>`. A repo with no config.yaml yet, or no `publish.core:` key, simply discovers nothing. */
  async discoverCoreLibs(): Promise<
    { libRoot: string; declaration: LibDeclaration }[]
  > {
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    return (config.publish?.core ?? []).map((libConfig) => ({
      libRoot: join(this.repoRoot, "source", "core", libConfig.name),
      declaration: toDeclaration("core", libConfig),
    }));
  }
}
