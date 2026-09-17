import { join } from "@std/path";
import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Proposes a vendored lib's local change upstream (`ens lib contribute <name>`) — thin wiring over `Vendor.VendorContribute`. Libs have no role ambiguity, so the path is always `source/libs/<name>`. */
export async function runLibContribute(
  name: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.PullRequestRef> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = join("source", "libs", name);
  const contribute = new Vendor.VendorContribute(repoRoot, registry, source);
  return await contribute.contribute(path);
}
