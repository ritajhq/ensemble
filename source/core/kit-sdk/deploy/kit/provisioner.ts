import type { Category } from "../workload.ts";
import type { MatchedResource } from "../resolve/matched-resource.ts";
import type { ResolvedValue } from "../resolve/resolved-values.ts";
import type { SecretDeclaration } from "../resource.ts";
import type { ArtifactFragment } from "../render/artifact.ts";

/**
 * A `ProvisioningRequest` once the `Renderer` has resolved every reference in
 * its params (Section 8): a static reference becomes its concrete baked
 * value, a dynamic one becomes the target's own native-wiring representation
 * — a provisioner never has to tell those apart, it just uses whatever value
 * is there. `secrets` is the whole workload's secret *declarations* (never
 * values — G4) passed through so a provisioner can resolve a plain
 * secret-name param (e.g. `passwordSecret: "db-password"`) into its own
 * target-native wiring; that's a provisioner-specific convention, not the
 * `${...}` reference grammar, so it isn't resolved by `ReferenceResolver`.
 */
export interface ResolvedRequest {
  readonly category: Category;
  readonly name: string;
  readonly type: string;
  readonly class?: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly values: Readonly<Record<string, ResolvedValue>>;
  readonly secrets: Readonly<Record<string, SecretDeclaration>>;
}

/** What provisioning one resource produces: its own artifact fragment, and the output values it declares for others to reference — raw values here; whether a given output is static or dynamic is the `Realization`'s call, consulted later by `ReferenceResolver`, not decided by the provisioner's return shape. */
export interface ProvisionOutcome {
  readonly fragment: ArtifactFragment;
  readonly outputs: Readonly<Record<string, unknown>>;
}

/**
 * A matchable implementation that fulfills a resource for a kit. `provision`
 * is optional: a project-declared `template`/`command` provisioner (Section
 * 10's extension ladder, rungs 2–3) can exist and be *selected* without yet
 * having a real body — `command` provisioners in particular can't provision
 * during the pure render pass at all (shelling out is I/O, G6), so their real
 * execution belongs at apply time (Phase 6), not here. `Renderer` raises a
 * clear error if it selects a provisioner with no `provision`.
 */
export interface Provisioner {
  matches(resource: MatchedResource): boolean;
  provision?(request: ResolvedRequest): ProvisionOutcome;
  /** A short human label for `ens deploy explain` (Phase 8) to name this provisioner by — "why this one matched, why the others didn't." Optional: a provisioner with no label falls back to a positional description ("provisioner #N"). */
  describe?(): string;
}

/** The provisioners a `Kit` offers, in match-priority order (first-match, Section 10). */
export type ProvisionerSet = readonly Provisioner[];
