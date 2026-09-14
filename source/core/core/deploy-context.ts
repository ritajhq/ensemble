import { join } from "@std/path";
import { exists } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "./repo.ts";

const RESOURCE_CONTRACTS: readonly KitSdk.Deploy.Contracts.ResourceContract[] =
  [
    KitSdk.Deploy.Contracts.relationalV1,
    KitSdk.Deploy.Contracts.containerOrchestratedV1,
  ];

export interface DeployContext {
  readonly repoRoot: string;
  readonly workload: KitSdk.Deploy.Workload;
  readonly target: KitSdk.Deploy.Target;
  readonly registry: KitSdk.Deploy.Contracts.Registry;
}

/** Resolves a deployment's manifest and kit by name — the one place `ens deploy` and `ens deploy explain` share this lookup (`ci/<name>/delivery.yml`, `.ensemble/kits/deploy/<kit>/`), so the two commands can't drift on how a deployment is found. */
export async function loadDeployContext(
  name: string,
  kit: string,
): Promise<DeployContext> {
  const repoRoot = await findRepoRoot();

  const manifestPath = join(repoRoot, "ci", name, "delivery.yml");
  if (!await exists(manifestPath, { isFile: true })) {
    throw new Error(`Delivery manifest not found at ${manifestPath}`);
  }
  const workload = await new KitSdk.Deploy.Manifest.Loader(
    new KitSdk.Deploy.Manifest.Parser(),
  ).loadFile(manifestPath);

  const vendoredKitDir = join(repoRoot, ".ensemble", "kits", "deploy", kit);
  if (!await exists(join(vendoredKitDir, "main.ts"), { isFile: true })) {
    throw new Error(
      `Deploy kit "${kit}" not found (expected ${vendoredKitDir}/main.ts)`,
    );
  }
  const sidecarConfigPath = join(repoRoot, "ci", name, `${kit}.config.yml`);
  const kitInstance = await new KitSdk.Deploy.KitLoader().load(vendoredKitDir, [
    sidecarConfigPath,
  ]);

  return {
    repoRoot,
    workload,
    target: { kit: kitInstance },
    registry: new KitSdk.Deploy.Contracts.Catalog(RESOURCE_CONTRACTS),
  };
}
