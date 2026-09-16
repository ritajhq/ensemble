import { join } from "@std/path";
import { exists } from "@std/fs";
import * as KitManifest from "./kit-manifest.ts";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";
import type { Entry } from "./entry.ts";

/**
 * Ejects a locally-authored kit into its own repository — the outbound
 * counterpart to `KitInstaller`, converging on the same lockfile
 * representation. Deliberately runs no self-containment check: unlike a
 * libs library, a kit is expected to depend on `@ensemble/kit-sdk` (Section
 * 5 of the vendoring build plan: "the only core package a kit is allowed to
 * import") — that dependency is the normal case here, not a violation.
 * Instead it runs the same light validation `KitInstaller` does (role
 * known, required entrypoints present) as a pre-flight before pushing
 * anything.
 */
export class KitEjector {
  constructor(
    private readonly repoRoot: string,
    private readonly registry: Registry,
    private readonly source: PackageSource,
  ) {}

  async eject(path: string, remote: string): Promise<Entry> {
    const dir = join(this.repoRoot, path);

    const manifest = await KitManifest.read(dir);
    for (const entrypoint of KitManifest.requiredEntrypoints(manifest.role)) {
      if (!await exists(join(dir, entrypoint), { isFile: true })) {
        throw new Error(
          `Kit at ${path} declares role "${manifest.role}" but is missing its required "${entrypoint}" entrypoint.`,
        );
      }
    }

    await this.source.flattenHistory(dir);
    const ref = await this.source.publishTo(dir, remote);

    const entry: Entry = { repo: remote, ref, path };
    await this.registry.register(entry);
    return entry;
  }
}
