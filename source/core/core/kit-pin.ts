import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Pins an installed kit to a different ref (`ens kit pin <name> <ref>`) — thin wiring over `Vendor.KitPinner`. */
export async function runKitPin(
  name: string,
  ref: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = await Vendor.resolveInstalledKitPath(registry, name);
  const pinner = new Vendor.KitPinner(repoRoot, registry, source);
  return await pinner.pin(path, ref);
}
