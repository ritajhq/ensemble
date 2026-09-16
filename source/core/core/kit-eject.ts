import type { RepoLocator } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Ejects a locally-authored kit (`ens kit eject <name> --remote <url>`) — resolves `<name>`'s role/path on disk, then thin wiring over `Vendor.KitEjector`. */
export async function runKitEject(
  name: string,
  remote: string,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const { path } = await Vendor.resolveLocalKitPath(repoRoot, name);
  const ejector = new Vendor.KitEjector(repoRoot, registry, source);
  return await ejector.eject(path, remote);
}
