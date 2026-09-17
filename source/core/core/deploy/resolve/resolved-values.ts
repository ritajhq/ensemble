/** Where a negotiated value came from — how `explain`/plan (Phase 8) will flag an unreviewed kit default or a clamped value. */
export type Provenance = "preset" | "default" | "capability" | "clamp";

export interface ResolvedValue {
  readonly value: number | boolean | string;
  readonly provenance: Provenance;
}

/** Every negotiated concern the `ValueNegotiator` resolved a value for, plus any clamp warnings raised along the way. A concern with no capability, preset, or platform default anywhere is simply absent — there was nothing to resolve. */
export interface ResolvedValues {
  readonly values: Readonly<Record<string, ResolvedValue>>;
  readonly warnings: readonly string[];
}
