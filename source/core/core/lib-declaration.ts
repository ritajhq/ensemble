import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { EnsembleConfigStore } from "./config.ts";

/** One `publish:` entry in a `lib.yml` — the kit to publish through and, only for a kit with more than one named destination, which one. */
export interface PublishEntry {
  readonly kit: string;
  readonly target?: string;
}

/** A library's `lib.yml`, parsed — the package name it publishes under and every kit/target it publishes through. */
export interface LibDeclaration {
  readonly package: string;
  readonly publish: readonly PublishEntry[];
}

function parsePublishEntries(path: string, value: unknown): PublishEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`lib.yml at ${path} has a "publish" that isn't a list.`);
  }
  return value.map((entry, index) => {
    if (
      typeof entry !== "object" || entry === null ||
      typeof (entry as { kit?: unknown }).kit !== "string"
    ) {
      throw new Error(
        `lib.yml at ${path} has an invalid "publish" entry at index ${index} (missing "kit").`,
      );
    }
    const { kit, target } = entry as { kit: string; target?: unknown };
    if (target !== undefined && typeof target !== "string") {
      throw new Error(
        `lib.yml at ${path} has a non-string "target" in its "publish" entry for kit "${kit}".`,
      );
    }
    return { kit, target };
  });
}

/**
 * Loads lib declarations — one at a time from a `lib.yml` (`load`, used for
 * `source/libs/**` libraries, which carry their own `lib.yml` since it has
 * to travel with them once ejected to their own repository), or by
 * discovering every entry under the top-level `libs:` key in
 * `.ensemble/config.yaml` (`discoverCoreLibs`, used for `source/core/**`
 * libraries, which stay in this repo and shouldn't carry ensemble-CLI-only
 * tooling metadata alongside their real exports). Mirrors how
 * `ReleaseCeremony.collectShipReleases` globs `ci/<name>/delivery.yml`.
 */
export class LibDeclarationLoader {
  constructor(private readonly repoRoot: string) {}

  async load(libRoot: string): Promise<LibDeclaration> {
    const path = join(libRoot, "lib.yml");
    let text: string;
    try {
      text = await Deno.readTextFile(path);
    } catch {
      throw new Error(`lib.yml not found at ${path}`);
    }

    const parsed = parseYaml(text) as Record<string, unknown> | null;
    const packageName = parsed?.package;
    if (typeof packageName !== "string" || packageName.length === 0) {
      throw new Error(`lib.yml at ${path} is missing a "package" name.`);
    }

    return {
      package: packageName,
      publish: parsePublishEntries(path, parsed?.publish),
    };
  }

  /** Every entry under `libs:` in `.ensemble/config.yaml`, resolved against `source/core/<name>` — the config-driven counterpart to the per-directory `lib.yml` scan `SelfContainmentChecker` still does for `source/libs/**`. A repo with no config.yaml yet, or no `libs:` key, simply discovers nothing. */
  async discoverCoreLibs(): Promise<
    { libRoot: string; declaration: LibDeclaration }[]
  > {
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    return Object.entries(config.libs ?? {}).map(([name, libConfig]) => {
      if (!libConfig.package) {
        throw new Error(
          `"libs.${name}" in .ensemble/config.yaml is missing a "package" name.`,
        );
      }
      return {
        libRoot: join(this.repoRoot, "source", "core", name),
        declaration: {
          package: libConfig.package,
          publish: (libConfig.publish ?? []).map(({ kit, target }) => ({ kit, target })),
        },
      };
    });
  }
}
