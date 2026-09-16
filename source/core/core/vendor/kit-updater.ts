import * as SemVer from "./semver.ts";
import type { KitPinner } from "./kit-pinner.ts";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";
import type { Entry } from "./entry.ts";

/**
 * Convenience over `KitPinner`: computes the next `patch`/`minor`/`major`
 * tag from the kit's currently pinned ref (same bump arithmetic
 * `ens release next` uses), confirms that exact tag actually exists
 * upstream, then pins to it — so `ens kit update <name>` never guesses at a
 * version the kit's maintainer never published.
 */
export class KitUpdater {
  constructor(
    private readonly registry: Registry,
    private readonly source: PackageSource,
    private readonly pinner: KitPinner,
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
        `"${path}" is pinned to "${existing.ref}", which isn't a semver tag — use "ens kit pin" with an explicit ref instead.`,
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
        `No "${targetTag}" tag found at ${existing.repo} for kit at ${path}.`,
      );
    }

    return await this.pinner.pin(path, targetTag);
  }
}
