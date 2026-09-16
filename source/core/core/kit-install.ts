import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/**
 * Installs a kit from an external git repository (`ens kit install <url>`) —
 * thin wiring over `Vendor.KitInstaller`, matching this file's sibling
 * `runX` entrypoints (`runAppCreate`, `runBuild`, …).
 */
export async function runKitInstall(
  urlWithOptionalRef: string,
): Promise<Vendor.Entry> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const installer = new Vendor.KitInstaller(
    repoRoot,
    registry,
    new Vendor.GitPackageSource(),
  );
  return await installer.install(urlWithOptionalRef);
}
