import { join } from "@std/path";
import type { RepoLocator } from "./ports.ts";
import * as Status from "./status/index.ts";
import * as Vendor from "./vendor/index.ts";

/** Uninstalls a vendored library (`ens lib uninstall <name>`) — finds what still declares it and hands that to `Vendor.Uninstaller`. */
export async function runLibUninstall(
  name: string,
  options: Vendor.UninstallOptions,
  repo: RepoLocator,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const usages = await new Status.Survey(repoRoot, registry).describeTo(new Status.LibraryUsages(name));
  return await new Vendor.Uninstaller(repoRoot, registry, source).uninstall(join("source", "libs", name), usages, options);
}
