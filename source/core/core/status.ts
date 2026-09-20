import { join } from "@std/path";
import { exists } from "@std/fs";
import { EnsembleConfigStore } from "./config.ts";
import * as Deploy from "./deploy/index.ts";
import type { Ports } from "./ports.ts";

const KIT_ROLES = ["build", "pack", "deploy", "lib"] as const;
type KitRole = typeof KIT_ROLES[number];

async function listKits(repoRoot: string, role: KitRole): Promise<string[]> {
  const dir = join(repoRoot, ".ensemble", "kits", role);
  if (!await exists(dir, { isDirectory: true })) return [];
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) names.push(entry.name);
  }
  return names.sort();
}

interface WorkloadSummary {
  name: string;
  ships: string[];
  categories: Partial<Record<Deploy.Category, string[]>>;
}

/**
 * Globs `ci/<name>/delivery.yml` the same way `ReleaseCeremony.collectShipReleases`
 * does, but keeps every workload separate (rather than deduplicating ship
 * names across manifests) since this is for orientation, not release planning.
 */
async function listWorkloads(repoRoot: string): Promise<WorkloadSummary[]> {
  const ciDir = join(repoRoot, "ci");
  if (!await exists(ciDir, { isDirectory: true })) return [];

  const loader = new Deploy.Manifest.Loader(new Deploy.Manifest.Parser());
  const workloads: WorkloadSummary[] = [];
  for await (const entry of Deno.readDir(ciDir)) {
    if (!entry.isDirectory) continue;
    const manifestPath = join(ciDir, entry.name, "delivery.yml");
    if (!await exists(manifestPath, { isFile: true })) continue;

    const workload = await loader.loadFile(manifestPath);
    const categories: Partial<Record<Deploy.Category, string[]>> = {};
    for (const category of Deploy.CATEGORIES) {
      const resources = workload[category];
      if (resources && Object.keys(resources).length > 0) {
        categories[category] = Object.keys(resources);
      }
    }
    workloads.push({
      name: entry.name,
      ships: Object.keys(workload.release ?? {}),
      categories,
    });
  }
  return workloads.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Prints a one-shot orientation summary — every app/kit/ship/workload name
 * `ens`'s other commands expect as an argument, gathered from
 * `.ensemble/config.yaml`, `.ensemble/kits/<role>/`, and each workload's
 * `ci/<name>/delivery.yml` in a single pass. Read-only: exists so a caller
 * (human or agent) doesn't
 * have to grep those three locations by hand before it can call anything
 * else with the right name.
 */
export async function runStatus(ports: Ports): Promise<void> {
  const repoRoot = await ports.repo.findRepoRoot();
  const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();

  const apps = Object.entries(config.build ?? {})
    .map(([name, appConfig]) => ({
      name,
      kit: appConfig.kit,
      target: appConfig.target,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log("Apps (build.<name> in .ensemble/config.yaml):");
  if (apps.length === 0) console.log("  (none configured)");
  for (const app of apps) {
    console.log(
      `  ${app.name} — kit ${app.kit}${
        app.target ? ` (target ${app.target})` : ""
      }`,
    );
  }

  console.log("\nInstalled kits (.ensemble/kits/<role>/):");
  for (const role of KIT_ROLES) {
    const kits = await listKits(repoRoot, role);
    console.log(`  ${role}: ${kits.length > 0 ? kits.join(", ") : "(none)"}`);
  }

  const coreLibs = (config.publish?.core ?? []).map((lib) => lib.package);
  const libs = (config.publish?.libs ?? []).map((lib) => lib.package);
  console.log("\nPublishable libraries (publish.* in .ensemble/config.yaml):");
  console.log(
    `  core: ${coreLibs.length > 0 ? coreLibs.join(", ") : "(none)"}`,
  );
  console.log(`  libs: ${libs.length > 0 ? libs.join(", ") : "(none)"}`);

  console.log("\nWorkloads (ci/<name>/delivery.yml):");
  const workloads = await listWorkloads(repoRoot);
  if (workloads.length === 0) console.log("  (none)");
  for (const workload of workloads) {
    const shipsText = workload.ships.length > 0
      ? workload.ships.join(", ")
      : "(none)";
    console.log(`  ${workload.name} — ships: ${shipsText}`);
    for (const [category, names] of Object.entries(workload.categories)) {
      console.log(`    ${category}: ${(names as string[]).join(", ")}`);
    }
  }
}
