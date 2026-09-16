import { join } from "@std/path";
import { exists } from "@std/fs";
import * as KitManifest from "./kit-manifest.ts";
import * as SemVer from "./semver.ts";
import { resolveProjectKitSdkVersion } from "./project-kit-sdk.ts";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";
import type { Entry } from "./entry.ts";

/**
 * Moves an already-installed kit to a different ref — `ens kit pin <name>
 * <ref>`. Re-runs the same light validation `KitInstaller` does at install
 * time (role/entrypoint presence, `kitSdk` compatibility), since the new ref
 * could have changed any of them, then updates the lockfile entry in place.
 * No re-routing, no re-registering from scratch — the checkout stays where
 * it is.
 */
export class KitPinner {
  constructor(
    private readonly repoRoot: string,
    private readonly registry: Registry,
    private readonly source: PackageSource,
  ) {}

  async pin(path: string, ref: string): Promise<Entry> {
    const existing = await this.registry.entryFor(path);
    if (!existing) {
      throw new Error(
        `"${path}" isn't a registered vendored checkout — nothing to pin.`,
      );
    }

    const dir = join(this.repoRoot, path);
    await this.source.switchTo(dir, ref);
    const resolvedRef = await this.source.currentRef(dir);

    const manifest = await KitManifest.read(dir);
    for (const entrypoint of KitManifest.requiredEntrypoints(manifest.role)) {
      if (!await exists(join(dir, entrypoint), { isFile: true })) {
        throw new Error(
          `Kit at ${path} declares role "${manifest.role}" but "${ref}" is missing its required "${entrypoint}" entrypoint.`,
        );
      }
    }

    const projectKitSdkVersion = await resolveProjectKitSdkVersion(
      this.repoRoot,
    );
    if (!SemVer.satisfies(projectKitSdkVersion, manifest.kitSdk)) {
      throw new Error(
        `Kit at ${path} pinned to "${ref}" requires kit-sdk "${manifest.kitSdk}", but this project resolves ` +
          `kit-sdk ${projectKitSdkVersion}. Pin to a different ref, or update this project's kit-sdk version.`,
      );
    }

    const entry: Entry = { repo: existing.repo, ref: resolvedRef, path };
    await this.registry.register(entry);
    return entry;
  }
}
