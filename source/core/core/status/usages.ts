import { Builder } from "./builder.ts";
import type { App, Kit, KitRole, Library, Workload } from "./project.ts";

/** Everything the project declares that names one kit — whatever would break if that kit disappeared. Deploy kits are named on the command line, never in a file, so nothing is ever listed for them. */
export class KitUsages extends Builder<string[]> {
  private readonly usages: string[] = [];

  constructor(private readonly role: KitRole, private readonly name: string) {
    super();
  }

  apps(apps: readonly App[]): void {
    if (this.role !== "build") return;
    for (const app of apps.filter((app) => app.kit === this.name)) {
      this.usages.push(`app ${app.name} (build.${app.name}.kit)`);
    }
  }

  kits(_kits: readonly Kit[]): void {}

  libraries(libraries: readonly Library[]): void {
    if (this.role !== "lib") return;
    for (const library of libraries.filter((library) => library.kits.includes(this.name))) {
      this.usages.push(`library ${library.package} (publish.${library.scope})`);
    }
  }

  workloads(workloads: readonly Workload[]): void {
    if (this.role !== "pack") return;
    for (const workload of workloads) {
      for (const ship of workload.ships.filter((ship) => ship.kit === this.name)) {
        this.usages.push(`release ${ship.name} (${workload.manifest})`);
      }
    }
  }

  build(): string[] {
    return this.usages;
  }
}

/** Everything the project declares that names one portable library under `source/libs/`. Imports from other code aren't declarations, so they aren't found here. */
export class LibraryUsages extends Builder<string[]> {
  private readonly usages: string[] = [];

  constructor(private readonly name: string) {
    super();
  }

  apps(_apps: readonly App[]): void {}

  kits(_kits: readonly Kit[]): void {}

  libraries(libraries: readonly Library[]): void {
    for (const library of libraries.filter((library) => library.scope === "libs" && library.name === this.name)) {
      this.usages.push(`library ${library.package} (publish.libs in .ensemble/config.yaml)`);
    }
  }

  workloads(_workloads: readonly Workload[]): void {}

  build(): string[] {
    return this.usages;
  }
}
