import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/**
 * Installs a kit from an external git repository (`ens kit install <url>`) —
 * thin wiring over `Vendor.KitInstaller`, matching this file's sibling
 * `runX` entrypoints (`runAppCreate`, `runBuild`, …).
 */
export async function runKitInstall(
  urlWithOptionalRef: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const installer = new Vendor.KitInstaller(repoRoot, registry, source);
  return await installer.install(urlWithOptionalRef);
}
