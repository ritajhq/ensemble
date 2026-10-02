import * as Core from "@ensemble/core";

/** The `ens status --json` document. `version` changes only when a field is removed or changes meaning, so a reader (the editor extension, a script) can tell a shape it doesn't understand. */
export interface Document {
  version: 1;
  apps: readonly Core.Status.App[];
  kits: readonly Core.Status.Kit[];
  libraries: readonly Core.Status.Library[];
  workloads: readonly Core.Status.Workload[];
}

/** `ens status --json`'s machine-readable report: the survey as one JSON document. */
export class Json extends Core.Status.Builder<string> {
  private readonly document: Document = { version: 1, apps: [], kits: [], libraries: [], workloads: [] };

  apps(apps: readonly Core.Status.App[]): void {
    this.document.apps = apps;
  }

  kits(kits: readonly Core.Status.Kit[]): void {
    this.document.kits = kits;
  }

  libraries(libraries: readonly Core.Status.Library[]): void {
    this.document.libraries = libraries;
  }

  workloads(workloads: readonly Core.Status.Workload[]): void {
    this.document.workloads = workloads;
  }

  build(): string {
    return JSON.stringify(this.document, null, 2);
  }
}
