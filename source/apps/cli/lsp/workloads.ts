import * as Core from "@ensemble/core";

/**
 * The last successfully parsed `Workload` of every open manifest. A manifest
 * is mid-edit most of the time an editor asks about it, and the strict parser
 * rejects a half-typed one — so a failed parse keeps the previous workload
 * rather than leaving the document with nothing to complete from.
 */
export class Workloads {
  private readonly byUri = new Map<string, Core.Deploy.Workload>();

  constructor(private readonly parser = new Core.Deploy.Manifest.Parser()) {}

  update(uri: string, text: string): void {
    try {
      this.byUri.set(uri, this.parser.parse(text));
    } catch {
      // Keep the last good parse.
    }
  }

  forget(uri: string): void {
    this.byUri.delete(uri);
  }

  of(uri: string): Core.Deploy.Workload {
    return this.byUri.get(uri) ?? {};
  }
}
