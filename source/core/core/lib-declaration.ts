import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";

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
 * Loads `lib.yml` declarations — one at a time (`load`), or by discovering
 * every `source/core/**\/lib.yml` (`discoverCoreLibs`), mirroring how
 * `ReleaseCeremony.collectShipReleases` globs `ci/<name>/delivery.yml`.
 * Reused as-is by both core libraries (discovered here) and libs libraries
 * (loaded one at a time by `ens lib publish` — a future phase); the shape
 * and the loader are identical for both, only the discovery/cascade differs.
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

  /** Every `source/core/<name>/lib.yml`, one level deep — the same layout `SelfContainmentChecker` scans for core workspace members. Core libraries that declare no `lib.yml` are simply not discovered here. */
  async discoverCoreLibs(): Promise<
    { libRoot: string; declaration: LibDeclaration }[]
  > {
    const coreDir = join(this.repoRoot, "source", "core");
    const results: { libRoot: string; declaration: LibDeclaration }[] = [];
    if (!await exists(coreDir, { isDirectory: true })) return results;

    for await (const entry of Deno.readDir(coreDir)) {
      if (!entry.isDirectory) continue;
      const libRoot = join(coreDir, entry.name);
      if (!await exists(join(libRoot, "lib.yml"), { isFile: true })) continue;
      results.push({ libRoot, declaration: await this.load(libRoot) });
    }
    return results;
  }
}
