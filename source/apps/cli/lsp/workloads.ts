import * as Core from "@ensemble/core";

/**
 * The workload every open manifest declares, as far as it reads. A manifest is
 * mid-edit most of the time an editor asks about it: entries with problems
 * still count, so references to them complete, and text that isn't YAML at
 * all keeps the previous workload rather than leaving nothing to complete
 * from.
 */
export class Workloads {
  private readonly byUri = new Map<string, Core.Deploy.Workload>();

  constructor(private readonly parser = new Core.Deploy.Manifest.Parser()) {}

  update(uri: string, text: string): void {
    try {
      this.byUri.set(uri, this.parser.read(text).workload);
    } catch {
      // Not YAML yet: keep the last workload read.
    }
  }

  forget(uri: string): void {
    this.byUri.delete(uri);
  }

  of(uri: string): Core.Deploy.Workload {
    return this.byUri.get(uri) ?? {};
  }
}
