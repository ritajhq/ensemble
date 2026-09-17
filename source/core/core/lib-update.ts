import { join } from "@std/path";
import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Updates a vendored lib to its next patch/minor/major tag (`ens lib update <name> [bump]`, defaulting to "patch") — thin wiring over `Vendor.LibUpdater`. */
export async function runLibUpdate(
  name: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
  kind: Vendor.SemVer.BumpKind = "patch",
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = join("source", "libs", name);
  const pinner = new Vendor.LibPinner(repoRoot, registry, source);
  const updater = new Vendor.LibUpdater(registry, source, pinner);
  return await updater.update(path, kind);
}
