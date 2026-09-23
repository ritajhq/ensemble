import { join } from "@std/path";
import { exists } from "@std/fs";
import * as Deploy from "./deploy/index.ts";
import type { RepoLocator } from "./ports.ts";

const RESOURCE_CONTRACTS: readonly Deploy.Contracts.ResourceContract[] = [
  Deploy.Contracts.relationalV1,
  Deploy.Contracts.containerOrchestratedV1,
  Deploy.Contracts.storageVolumeV1,
  Deploy.Contracts.gatewayV1,
  Deploy.Contracts.objectStorageV1,
];

/**
 * `relational.v1`'s optional `init` param (Section 6 of its own contract
 * comment) is a list of project-relative file paths — the only param on any
 * contract today that names a file rather than passing data through
 * untouched, so it's the only one needing repo-relative resolution. A
 * provisioner never receives `repoRoot` (G6: the render pass is pure, no
 * filesystem/environment context of its own), so this is resolved here
 * instead — the one place both the freshly parsed `workload` and `repoRoot`
 * are already in scope together, before either ever reaches the render
 * pipeline. Leaves every other resource, and every other param, untouched.
 */
export function resolveRelationalInitPaths(
  workload: Deploy.Workload,
  repoRoot: string,
): Deploy.Workload {
  const databases = workload.databases;
  if (!databases) return workload;

  const resolved: Record<string, Deploy.ResourceDeclaration> = {};
  let changed = false;
  for (const [name, declaration] of Object.entries(databases)) {
    const init = declaration.params.init;
    if (declaration.type !== "relational" || !Array.isArray(init)) {
      resolved[name] = declaration;
      continue;
    }
    changed = true;
    resolved[name] = {
      ...declaration,
      params: {
        ...declaration.params,
        init: init.map((path) =>
          typeof path === "string" ? join(repoRoot, path) : path
        ),
      },
    };
  }
  return changed ? { ...workload, databases: resolved } : workload;
}

export interface DeployContext {
  readonly repoRoot: string;
  readonly workload: Deploy.Workload;
  readonly target: Deploy.Target;
  readonly registry: Deploy.Contracts.Registry;
}

/** Resolves a deployment's manifest and kit by name — the one place `ens deploy` and `ens deploy explain` share this lookup (`ci/<name>/delivery.yml`, `.ensemble/kits/deploy/<kit>/`), so the two commands can't drift on how a deployment is found. */
export async function loadDeployContext(
  name: string,
  kit: string,
  repo: RepoLocator,
  kitLoader: Deploy.KitLoader,
): Promise<DeployContext> {
  const repoRoot = await repo.findRepoRoot();

  const manifestPath = join(repoRoot, "ci", name, "delivery.yml");
  if (!await exists(manifestPath, { isFile: true })) {
    throw new Error(`Delivery manifest not found at ${manifestPath}`);
  }
  const workload = resolveRelationalInitPaths(
    await new Deploy.Manifest.Loader(
      new Deploy.Manifest.Parser(),
    ).loadFile(manifestPath),
    repoRoot,
  );

  const vendoredKitDir = join(repoRoot, ".ensemble", "kits", "deploy", kit);
  if (!await exists(join(vendoredKitDir, "main.ts"), { isFile: true })) {
    throw new Error(
      `Deploy kit "${kit}" not found (expected ${vendoredKitDir}/main.ts)`,
    );
  }
  const sidecarConfigPath = join(repoRoot, "ci", name, `${kit}.config.yml`);
  const loaded = await kitLoader.load(vendoredKitDir, [sidecarConfigPath]);

  return {
    repoRoot,
    workload,
    target: { kit: loaded.kit, runtime: loaded.runtime },
    registry: new Deploy.Contracts.Catalog(RESOURCE_CONTRACTS),
  };
}
