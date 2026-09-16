import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Updates an installed kit to its next patch/minor/major tag (`ens kit update <name> [bump]`, defaulting to "patch") — thin wiring over `Vendor.KitUpdater`. */
export async function runKitUpdate(
  name: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
  kind: Vendor.SemVer.BumpKind = "patch",
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = await Vendor.resolveInstalledKitPath(registry, name);
  const pinner = new Vendor.KitPinner(repoRoot, registry, source);
  const updater = new Vendor.KitUpdater(registry, source, pinner);
  return await updater.update(path, kind);
}
