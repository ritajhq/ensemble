import { Project } from "./ecosystem/index.ts";
import type { Ports } from "./ports.ts";
import * as Vendor from "./vendor/index.ts";

/** Installs a libs library from an external git repository (`ens lib install <url>`) — thin wiring over `Vendor.LibInstaller`. */
export async function runLibInstall(
  urlWithOptionalRef: string,
  ports: Ports,
  source: Vendor.PackageSource,
): Promise<Vendor.Entry> {
  const repoRoot = await ports.repo.findRepoRoot();
  const registry = new Vendor.FileRegistry(repoRoot);
  const project = await Project.load(repoRoot, ports);
  const installer = new Vendor.LibInstaller(
    repoRoot,
    registry,
    source,
    project,
  );
  const entry = await installer.install(urlWithOptionalRef);
  await project.sync();
  return entry;
}
