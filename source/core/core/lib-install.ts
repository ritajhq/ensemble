import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Installs a libs library from an external git repository (`ens lib install <url>`) — thin wiring over `Vendor.LibInstaller`. */
export async function runLibInstall(
  urlWithOptionalRef: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const installer = new Vendor.LibInstaller(repoRoot, registry, source);
  return await installer.install(urlWithOptionalRef);
}
