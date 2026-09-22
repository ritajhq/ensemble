/**
 * A resource declaration as it appears in the manifest, before any contract has
 * matched it (Phase 2) — just what the envelope parser can validate on its own:
 * the common fields every typed resource carries, plus its per-type fields
 * passed through untouched as `params` (validating those is the
 * ContractRegistry's job, not the envelope parser's — see Section 5/6 of the
 * rearchitecture plan).
 */
export interface ResourceDeclaration {
  readonly type: string;
  readonly class?: string;
  readonly capabilities?: Readonly<Record<string, boolean | number>>;
  readonly params: Readonly<Record<string, unknown>>;
}

/** A `secrets` entry — sourced externally (file or environment), never minted by ens. */
export interface SecretDeclaration {
  readonly source: "file" | "environment";
}

/**
 * A `variables` entry — a deploy-time value read from `ens deploy`'s own
 * process env (naming convention: `Renderer`'s `environmentVariableName`,
 * same uppercase/dash-to-underscore convention `secrets` uses), falling back
 * to `default` when unset. Unlike a secret, a variable's actual value is
 * safe to bake directly into the rendered artifact — `Renderer` resolves
 * `${variables.<name>.value}` the same way it resolves an `external`
 * reference: straight off the declaration, no provisioner involved.
 */
export interface VariableDeclaration {
  readonly default?: string;
}

/** An `external` entry — a resource ens does not provision, only references. */
export interface ExternalDeclaration {
  readonly type: string;
  readonly name: string;
}
