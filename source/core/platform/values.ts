import type { Manifest } from "./manifest.ts";

/**
 * What one environment supplies: each variable's value, and which secrets it
 * holds. A secret's value never leaves the store that keeps it sealed, so
 * only its name is here.
 */
export class Values {
  constructor(
    readonly variables: ReadonlyMap<string, string>,
    readonly secrets: ReadonlySet<string>,
  ) {}

  static none(): Values {
    return new Values(new Map(), new Set());
  }

  /** What `manifest` declares that these leave unanswered: a variable with neither a value nor a default, or a secret with no value. */
  missingFor(manifest: Manifest): string[] {
    const variables = manifest.variables
      .filter((variable) =>
        variable.default === undefined && !this.variables.has(variable.name)
      )
      .map((variable) => variable.name);
    const secrets = manifest.secrets.filter((secret) =>
      !this.secrets.has(secret)
    );
    return [...variables, ...secrets];
  }
}
