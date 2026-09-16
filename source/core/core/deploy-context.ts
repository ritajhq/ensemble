import { join } from "@std/path";
import { exists } from "@std/fs";
import * as Deploy from "./deploy/index.ts";
import type { RepoLocator } from "./ports.ts";

const RESOURCE_CONTRACTS: readonly Deploy.Contracts.ResourceContract[] =
  [
    Deploy.Contracts.relationalV1,
    Deploy.Contracts.containerOrchestratedV1,
  ];

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
): Promise<DeployContext> {
  const repoRoot = await repo.findRepoRoot();

  const manifestPath = join(repoRoot, "ci", name, "delivery.yml");
  if (!await exists(manifestPath, { isFile: true })) {
    throw new Error(`Delivery manifest not found at ${manifestPath}`);
  }
  const workload = await new Deploy.Manifest.Loader(
    new Deploy.Manifest.Parser(),
  ).loadFile(manifestPath);

  const vendoredKitDir = join(repoRoot, ".ensemble", "kits", "deploy", kit);
  if (!await exists(join(vendoredKitDir, "main.ts"), { isFile: true })) {
    throw new Error(
      `Deploy kit "${kit}" not found (expected ${vendoredKitDir}/main.ts)`,
    );
  }
  const sidecarConfigPath = join(repoRoot, "ci", name, `${kit}.config.yml`);
  const loaded = await new Deploy.KitLoader().load(vendoredKitDir, [
    sidecarConfigPath,
  ]);

  return {
    repoRoot,
    workload,
    target: { kit: loaded.kit, runtime: loaded.runtime },
    registry: new Deploy.Contracts.Catalog(RESOURCE_CONTRACTS),
  };
}
