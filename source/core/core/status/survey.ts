import { join, relative } from "@std/path";
import { exists } from "@std/fs";
import { EnsembleConfigStore, type LibConfig } from "../config.ts";
import * as Deploy from "../deploy/index.ts";
import * as Vendor from "../vendor/index.ts";
import type { Builder } from "./builder.ts";
import { type App, type Kit, KIT_ROLES, type KitRole, type Library, type Vendoring, type Workload } from "./project.ts";

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/**
 * Gathers every app, kit, library and workload this project knows about —
 * from `.ensemble/config.yaml`, `.ensemble/kits/<role>/`, the vendoring
 * lockfile and each `ci/<name>/` delivery manifest — and describes them to a
 * `Builder`. Read-only: it exists so a caller (person, agent or editor) knows
 * every name `ens`'s other commands expect without grepping for them.
 */
export class Survey {
  constructor(
    private readonly repoRoot: string,
    private readonly vendor: Vendor.Registry = new Vendor.FileRegistry(repoRoot),
  ) {}

  async describeTo<Output>(builder: Builder<Output>): Promise<Output> {
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    const vendored = new Map((await this.vendor.all()).map((entry) => [entry.path, entry]));

    builder.apps(this.apps(config.build ?? {}));
    builder.kits(await this.kits(vendored));
    builder.libraries(this.libraries(config.publish ?? {}, vendored));
    builder.workloads(await this.workloads());
    return builder.build();
  }

  private apps(build: Record<string, { kit: string; target?: string }>): App[] {
    return Object.entries(build)
      .map(([name, app]) => ({ name, kit: app.kit, target: app.target }))
      .sort(byName);
  }

  private async kits(vendored: Map<string, Vendoring>): Promise<Kit[]> {
    const kits: Kit[] = [];
    for (const role of KIT_ROLES) {
      kits.push(...await this.kitsOf(role, vendored));
    }
    return kits;
  }

  private async kitsOf(role: KitRole, vendored: Map<string, Vendoring>): Promise<Kit[]> {
    const dir = join(this.repoRoot, ".ensemble", "kits", role);
    if (!await exists(dir, { isDirectory: true })) return [];

    const kits: Kit[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isDirectory) continue;
      const path = join(".ensemble", "kits", role, entry.name);
      kits.push({ name: entry.name, role, path, vendored: this.vendoringOf(path, vendored) });
    }
    return kits.sort(byName);
  }

  private libraries(
    publish: { core?: LibConfig[]; libs?: LibConfig[] },
    vendored: Map<string, Vendoring>,
  ): Library[] {
    const describe = (scope: Library["scope"]) => (lib: LibConfig): Library => {
      const path = join("source", scope, lib.name);
      return {
        name: lib.name,
        package: lib.package,
        scope,
        path,
        kits: (lib.publish ?? []).map((entry) => entry.kit),
        vendored: this.vendoringOf(path, vendored),
      };
    };
    return [
      ...(publish.core ?? []).map(describe("core")).sort(byName),
      ...(publish.libs ?? []).map(describe("libs")).sort(byName),
    ];
  }

  private async workloads(): Promise<Workload[]> {
    const ciDir = join(this.repoRoot, "ci");
    if (!await exists(ciDir, { isDirectory: true })) return [];

    const locator = new Deploy.Manifest.Locator();
    const loader = new Deploy.Manifest.Loader(new Deploy.Manifest.Parser());
    const workloads: Workload[] = [];
    for await (const entry of Deno.readDir(ciDir)) {
      if (!entry.isDirectory) continue;
      const manifestPath = await locator.find(join(ciDir, entry.name));
      if (!manifestPath) continue;

      const workload = await loader.loadFile(manifestPath);
      workloads.push({
        name: entry.name,
        manifest: relative(this.repoRoot, manifestPath),
        ships: Object.entries(workload.release ?? {}).map(([name, release]) => ({ name, kit: release.kit })),
        resources: this.resourcesOf(workload),
      });
    }
    return workloads.sort(byName);
  }

  private resourcesOf(workload: Deploy.Workload): Workload["resources"] {
    const resources: Partial<Record<Deploy.Category, string[]>> = {};
    for (const category of Deploy.CATEGORIES) {
      const names = Object.keys(workload[category] ?? {});
      if (names.length > 0) resources[category] = names;
    }
    return resources;
  }

  private vendoringOf(path: string, vendored: Map<string, Vendoring>): Vendoring | undefined {
    const entry = vendored.get(path);
    return entry ? { repo: entry.repo, ref: entry.ref } : undefined;
  }
}
