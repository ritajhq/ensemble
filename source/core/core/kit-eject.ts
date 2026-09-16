import { findRepoRoot } from "./repo.ts";
import * as Vendor from "./vendor/index.ts";

/** Ejects a locally-authored kit (`ens kit eject <name> --remote <url>`) — resolves `<name>`'s role/path on disk, then thin wiring over `Vendor.KitEjector`. */
export async function runKitEject(
  name: string,
  remote: string,
): Promise<Vendor.Entry> {
  const repoRoot = await findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const { path } = await Vendor.resolveLocalKitPath(repoRoot, name);
  const ejector = new Vendor.KitEjector(
    repoRoot,
    registry,
    new Vendor.GitPackageSource(),
  );
  return await ejector.eject(path, remote);
}
