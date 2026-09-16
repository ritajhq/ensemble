import * as SemVer from "./semver.ts";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";
import type { Entry } from "./entry.ts";
import type { LibPinner } from "./lib-pinner.ts";

/**
 * Convenience over `LibPinner`: computes the next `patch`/`minor`/`major`
 * tag from the lib's currently pinned ref, confirms that exact tag exists
 * upstream, then pins to it — the same bump-and-verify shape as
 * `KitUpdater`, kept as its own class since it delegates to `LibPinner`
 * (self-containment revalidation) rather than `KitPinner`.
 */
export class LibUpdater {
  constructor(
    private readonly registry: Registry,
    private readonly source: PackageSource,
    private readonly pinner: LibPinner,
  ) {}

  async update(path: string, kind: SemVer.BumpKind): Promise<Entry> {
    const existing = await this.registry.entryFor(path);
    if (!existing) {
      throw new Error(
        `"${path}" isn't a registered vendored checkout — nothing to update.`,
      );
    }

    const current = SemVer.parseTag(existing.ref);
    if (!current) {
      throw new Error(
        `"${path}" is pinned to "${existing.ref}", which isn't a semver tag — use "ens lib pin" with an explicit ref instead.`,
      );
    }

    const targetTag = SemVer.formatTag(
      SemVer.bump(current, kind),
      existing.ref,
    );
    const availableVersions = await this.source.availableVersions(
      existing.repo,
    );
    if (!availableVersions.includes(targetTag)) {
      throw new Error(
        `No "${targetTag}" tag found at ${existing.repo} for lib at ${path}.`,
      );
    }

    return await this.pinner.pin(path, targetTag);
  }
}
