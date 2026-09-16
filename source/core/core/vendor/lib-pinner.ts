import { join } from "@std/path";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";
import type { Entry } from "./entry.ts";
import { SelfContainmentChecker } from "../lib-self-containment.ts";

/**
 * Moves an already-vendored lib (installed or ejected) to a different ref —
 * `ens lib pin <name> <ref>`. Kept fully separate from `KitPinner`: a lib
 * has nothing like `kitSdk`/entrypoints to revalidate, and instead re-runs
 * the self-containment check, since the new ref could introduce a
 * violation that wasn't there before.
 */
export class LibPinner {
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

    const violations = await new SelfContainmentChecker(this.repoRoot).check(
      dir,
    );
    if (violations.length > 0) {
      const details = violations.map((violation) =>
        `  - ${violation.importSpecifier}: ${violation.reason}`
      ).join(
        "\n",
      );
      throw new Error(
        `"${path}" pinned to "${ref}" isn't self-contained enough:\n${details}`,
      );
    }

    const resolvedRef = await this.source.currentRef(dir);
    const entry: Entry = { repo: existing.repo, ref: resolvedRef, path };
    await this.registry.register(entry);
    return entry;
  }
}
