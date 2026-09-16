import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/** Proposes an installed kit's local change upstream (`ens kit contribute <name>`) — resolves `<name>` to its path, then thin wiring over `Vendor.VendorContribute`. */
export async function runKitContribute(
  name: string,
): Promise<Vendor.PullRequestRef> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = await Vendor.resolveInstalledKitPath(registry, name);
  const contribute = new Vendor.VendorContribute(
    repoRoot,
    registry,
    new Vendor.GitPackageSource(),
  );
  return await contribute.contribute(path);
}
