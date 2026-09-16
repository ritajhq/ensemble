import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/** Pins an installed kit to a different ref (`ens kit pin <name> <ref>`) — thin wiring over `Vendor.KitPinner`. */
export async function runKitPin(
  name: string,
  ref: string,
): Promise<Vendor.Entry> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const path = await Vendor.resolveInstalledKitPath(registry, name);
  const pinner = new Vendor.KitPinner(
    repoRoot,
    registry,
    new Vendor.GitPackageSource(),
  );
  return await pinner.pin(path, ref);
}
