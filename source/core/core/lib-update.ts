import { join } from "@std/path";
import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/** Updates a vendored lib to its next patch/minor/major tag (`ens lib update <name> [bump]`, defaulting to "patch") — thin wiring over `Vendor.LibUpdater`. */
export async function runLibUpdate(
  name: string,
  kind: Vendor.SemVer.BumpKind = "patch",
): Promise<Vendor.Entry> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = join("source", "libs", name);
  const source = new Vendor.GitPackageSource();
  const pinner = new Vendor.LibPinner(repoRoot, registry, source);
  const updater = new Vendor.LibUpdater(registry, source, pinner);
  return await updater.update(path, kind);
}
