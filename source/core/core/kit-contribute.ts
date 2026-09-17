import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Proposes an installed kit's local change upstream (`ens kit contribute <name>`) — resolves `<name>` to its path, then thin wiring over `Vendor.VendorContribute`. */
export async function runKitContribute(
  name: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.PullRequestRef> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = await Vendor.resolveInstalledKitPath(registry, name);
  const contribute = new Vendor.VendorContribute(repoRoot, registry, source);
  return await contribute.contribute(path);
}
