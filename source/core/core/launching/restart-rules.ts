import type { LaunchEntry } from "../deploy/launch.ts";

/** A build or a pack whose output changed. */
export type Output = { readonly build: string } | { readonly pack: string };

/** Which launch entries to restart when an output changes, from each entry's `development.restart`. */
export class RestartRules {
  constructor(
    private readonly entries: Readonly<Record<string, LaunchEntry>>,
  ) {}

  /** Entry names, in manifest order, that asked to restart for `output`. */
  for(output: Output): string[] {
    return Object.entries(this.entries)
      .filter(([, entry]) =>
        (entry.development?.restart ?? []).some((rule) =>
          this.same(rule, output)
        )
      )
      .map(([name]) => name);
  }

  /** Every output some entry asked to restart for. */
  outputs(): Output[] {
    const seen = new Map<string, Output>();
    for (const entry of Object.values(this.entries)) {
      for (const rule of entry.development?.restart ?? []) {
        seen.set(this.key(rule), rule);
      }
    }
    return [...seen.values()];
  }

  private same(a: Output, b: Output): boolean {
    return this.key(a) === this.key(b);
  }

  private key(output: Output): string {
    return "build" in output ? `build:${output.build}` : `pack:${output.pack}`;
  }
}
