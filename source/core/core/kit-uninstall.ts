import type { RepoLocator } from "./ports.ts";
import * as Status from "./status/index.ts";
import * as Vendor from "./vendor/index.ts";

/** Uninstalls a vendored kit (`ens kit uninstall <name>`) — resolves it by name, finds what still uses it, and hands both to `Vendor.Uninstaller`. */
export async function runKitUninstall(
  name: string,
  options: Vendor.UninstallOptions,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const { role, path } = await Vendor.resolveLocalKitPath(repoRoot, name);
  const usages = await new Status.Survey(repoRoot, registry).describeTo(new Status.KitUsages(role, name));
  return await new Vendor.Uninstaller(repoRoot, registry, source).uninstall(path, usages, options);
}
