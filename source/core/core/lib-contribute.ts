import { join } from "@std/path";
import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/** Proposes a vendored lib's local change upstream (`ens lib contribute <name>`) — thin wiring over `Vendor.VendorContribute`. Libs have no role ambiguity, so the path is always `source/libs/<name>`. */
export async function runLibContribute(
  name: string,
): Promise<Vendor.PullRequestRef> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = join("source", "libs", name);
  const contribute = new Vendor.VendorContribute(
    repoRoot,
    registry,
    new Vendor.GitPackageSource(),
  );
  return await contribute.contribute(path);
}
