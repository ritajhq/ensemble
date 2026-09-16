import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/** Updates an installed kit to its next patch/minor/major tag (`ens kit update <name> [bump]`, defaulting to "patch") — thin wiring over `Vendor.KitUpdater`. */
export async function runKitUpdate(
  name: string,
  kind: Vendor.SemVer.BumpKind = "patch",
): Promise<Vendor.Entry> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = await Vendor.resolveInstalledKitPath(registry, name);
  const source = new Vendor.GitPackageSource();
  const pinner = new Vendor.KitPinner(repoRoot, registry, source);
  const updater = new Vendor.KitUpdater(registry, source, pinner);
  return await updater.update(path, kind);
}
