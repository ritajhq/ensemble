import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/** Installs a libs library from an external git repository (`ens lib install <url>`) — thin wiring over `Vendor.LibInstaller`. */
export async function runLibInstall(
  urlWithOptionalRef: string,
): Promise<Vendor.Entry> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const installer = new Vendor.LibInstaller(
    repoRoot,
    registry,
    new Vendor.GitPackageSource(),
  );
  return await installer.install(urlWithOptionalRef);
}
