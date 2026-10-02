import { join } from "@std/path";
import { exists } from "@std/fs";
import type { Entry } from "./entry.ts";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";

export interface UninstallOptions {
  /** Uninstall even when the project still uses the checkout, or the checkout holds local changes. */
  readonly force: boolean;
}

/**
 * Removes a vendored kit or library — `ens kit uninstall` / `ens lib
 * uninstall`, the inverse of installing it: the checkout, its lockfile row and
 * its `.gitignore` line. Only vendored checkouts can be uninstalled; something
 * authored in this project was never installed, and deleting it is deleting
 * the project's own code. Refuses, unless forced, while the project still
 * declares a use of it or the checkout holds work its remote doesn't have.
 */
export class Uninstaller {
  constructor(
    private readonly repoRoot: string,
    private readonly registry: Registry,
    private readonly source: PackageSource,
  ) {}

  async uninstall(path: string, usages: readonly string[], options: UninstallOptions): Promise<Entry> {
    const entry = await this.registry.entryFor(path);
    if (!entry) {
      throw new Error(
        `"${path}" isn't vendored, so there's nothing to uninstall — it was authored in this project. Delete it yourself if you mean to.`,
      );
    }

    const dir = join(this.repoRoot, path);
    const present = await exists(dir, { isDirectory: true });
    if (!options.force) {
      this.refuseWhileUsed(path, usages);
      if (present) await this.refuseWithLocalChanges(path, dir);
    }

    if (present) await Deno.remove(dir, { recursive: true });
    await this.registry.unregister(path);
    return entry;
  }

  private refuseWhileUsed(path: string, usages: readonly string[]): void {
    if (usages.length === 0) return;
    throw new Error(
      `"${path}" is still used by:\n${usages.map((usage) => `  - ${usage}`).join("\n")}\n` +
        `Remove those uses first, or pass --force to uninstall anyway.`,
    );
  }

  private async refuseWithLocalChanges(path: string, dir: string): Promise<void> {
    if (!await this.source.hasLocalChanges(dir)) return;
    throw new Error(
      `"${path}" has local changes its remote doesn't have, which uninstalling would lose. ` +
        `Contribute them first (contribute), or pass --force to discard them.`,
    );
  }
}
