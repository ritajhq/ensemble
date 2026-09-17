import { join } from "@std/path";
import type { RepoLocator } from "./ports.ts";
import { SelfContainmentChecker } from "./lib-self-containment.ts";
import * as Vendor from "./vendor/index.ts";

/**
 * Ejects a libs library into its own repository: checks self-containment
 * first (aborting before any git operation on any violation), then replaces
 * the library's history with a single fresh commit, pushes it to `remote`,
 * and registers the path in the vendoring lockfile exactly as a `KitInstaller`
 * install would — after ejection, the path is an ordinary vendored checkout,
 * indistinguishable from an inbound-installed kit.
 */
export class LibEjector {
  constructor(
    private readonly repoRoot: string,
    private readonly checker: SelfContainmentChecker,
    private readonly registry: Vendor.Registry,
    private readonly source: Vendor.PackageSource,
  ) {}

  async eject(name: string, remote: string): Promise<Vendor.Entry> {
    const relativePath = join("source", "libs", name);
    const libRoot = join(this.repoRoot, relativePath);

    const violations = await this.checker.check(libRoot);
    if (violations.length > 0) {
      const details = violations.map((violation) =>
        `  - ${violation.importSpecifier}: ${violation.reason}`
      ).join(
        "\n",
      );
      throw new Error(
        `"${name}" isn't self-contained enough to eject:\n${details}`,
      );
    }

    await this.source.flattenHistory(libRoot);
    const ref = await this.source.publishTo(libRoot, remote);

    const entry: Vendor.Entry = { repo: remote, ref, path: relativePath };
    await this.registry.register(entry);
    return entry;
  }
}

/** Ejects a libs library (`ens lib eject <name> --remote <url>`) — thin wiring over `LibEjector`. */
export async function runLibEject(
  name: string,
  remote: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const checker = new SelfContainmentChecker(repoRoot);
  const registry = new Vendor.FileRegistry(repoRoot);
  const ejector = new LibEjector(repoRoot, checker, registry, source);
  return await ejector.eject(name, remote);
}
