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
 * A `variables` entry — developer-owned, valueless in the manifest, supplied at
 * deploy time. The plan gives no fixed shape for this category, so it stays a
 * permissive passthrough bag (see Phase 1 report: flagged as an open question).
 */
export interface VariableDeclaration {
  readonly params: Readonly<Record<string, unknown>>;
}

/** An `external` entry — a resource ens does not provision, only references. */
export interface ExternalDeclaration {
  readonly type: string;
  readonly name: string;
}
