import { join } from "@std/path";
import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Pins a vendored lib to a different ref (`ens lib pin <name> <ref>`) — thin wiring over `Vendor.LibPinner`. */
export async function runLibPin(
  name: string,
  ref: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = join("source", "libs", name);
  const pinner = new Vendor.LibPinner(repoRoot, registry, source);
  return await pinner.pin(path, ref);
}
