import type * as Deploy from "@ensemble/core/deploy";

/** A `variables` entry as an environment has to answer it. */
export interface DeclaredVariable {
  readonly name: string;
  /** A `type: list` variable, given as comma-separated entries. */
  readonly list: boolean;
  /** What it takes when an environment says nothing. */
  readonly default?: string;
}

/**
 * One delivery manifest (`ci/<name>/delivery.yml`) as the platform needs it:
 * the ships a release packs from it, and the values its environments must
 * supply. A read of the checkout, rebuilt on every sync, never edited here.
 */
export class Manifest {
  constructor(
    readonly name: string,
    readonly ships: readonly string[],
    readonly variables: readonly DeclaredVariable[],
    /** Names of its `secrets` entries read from the environment. */
    readonly secrets: readonly string[],
  ) {}

  /** Whether an environment of this manifest can be given a value for `variable`. */
  declaresVariable(variable: string): boolean {
    return this.variables.some((declared) => declared.name === variable);
  }

  /** Whether an environment of this manifest can be given a value for `secret`. */
  declaresSecret(secret: string): boolean {
    return this.secrets.includes(secret);
  }

  static of(name: string, workload: Deploy.Workload): Manifest {
    return new Manifest(
      name,
      Object.keys(workload.release ?? {}),
      Object.entries(workload.variables ?? {}).map(([variable, declared]) => ({
        name: variable,
        list: declared.type === "list",
        ...(declared.default === undefined
          ? {}
          : { default: declared.default }),
      })),
      Object.entries(workload.secrets ?? {})
        .filter(([, declared]) => declared.source === "environment")
        .map(([secret]) => secret),
    );
  }
}
