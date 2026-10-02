import * as Core from "@ensemble/core";

const describeVendoring = (vendored?: Core.Status.Vendoring) => vendored ? ` (vendored from ${vendored.repo} @ ${vendored.ref})` : "";

/** `ens status`'s human-readable report: one titled section per kind of thing, naming where in the project it's declared. */
export class Text extends Core.Status.Builder<string> {
  private readonly lines: string[] = [];

  apps(apps: readonly Core.Status.App[]): void {
    this.section("Apps (build.<name> in .ensemble/config.yaml)");
    if (apps.length === 0) this.lines.push("  (none configured)");
    for (const app of apps) {
      this.lines.push(`  ${app.name} — kit ${app.kit}${app.target ? ` (target ${app.target})` : ""}`);
    }
  }

  kits(kits: readonly Core.Status.Kit[]): void {
    this.section("Installed kits (.ensemble/kits/<role>/)");
    for (const role of Core.Status.KIT_ROLES) {
      const ofRole = kits.filter((kit) => kit.role === role);
      const names = ofRole.map((kit) => `${kit.name}${describeVendoring(kit.vendored)}`);
      this.lines.push(`  ${role}: ${names.length > 0 ? names.join(", ") : "(none)"}`);
    }
  }

  libraries(libraries: readonly Core.Status.Library[]): void {
    this.section("Publishable libraries (publish.* in .ensemble/config.yaml)");
    for (const scope of ["core", "libs"] as const) {
      const ofScope = libraries.filter((library) => library.scope === scope);
      const names = ofScope.map((library) => `${library.package}${describeVendoring(library.vendored)}`);
      this.lines.push(`  ${scope}: ${names.length > 0 ? names.join(", ") : "(none)"}`);
    }
  }

  workloads(workloads: readonly Core.Status.Workload[]): void {
    this.section("Workloads (ci/<name>/delivery.yml)");
    if (workloads.length === 0) this.lines.push("  (none)");
    for (const workload of workloads) {
      const ships = workload.ships.map((ship) => ship.name);
      this.lines.push(`  ${workload.name} — ships: ${ships.length > 0 ? ships.join(", ") : "(none)"}`);
      for (const [category, names] of Object.entries(workload.resources)) {
        this.lines.push(`    ${category}: ${names.join(", ")}`);
      }
      if (workload.tasks.length > 0) {
        this.lines.push(`    tasks: ${workload.tasks.map((task) => task.name).join(", ")}`);
      }
    }
  }

  build(): string {
    return this.lines.join("\n");
  }

  private section(title: string): void {
    if (this.lines.length > 0) this.lines.push("");
    this.lines.push(`${title}:`);
  }
}
