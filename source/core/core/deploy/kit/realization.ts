import type { Category } from "../workload.ts";

/** What `class` expands to, concretely, for one (category, type) — e.g. `critical` relational → `{ backupRetention: 35, multiAz: true }`. Ships with the kit, platform-overridable (Section 6). */
export interface ClassPreset {
  readonly concernValues: Readonly<Record<string, number | boolean | string>>;
}

/** A platform-set cap on a single negotiated concern's numeric value. Bounds only ever clamp numbers — a boolean concern (e.g. `multiAz`) has no "too high" to cap. */
export interface Bound {
  readonly max?: number;
  readonly min?: number;
}

export type Knowability = "static" | "dynamic";

/**
 * The per-kit realization of a Type's contract (Section 6): its class presets,
 * its platform defaults and bounds for negotiated concerns, which capabilities
 * it actually satisfies (undeclared = unsatisfied, Section 11's fail-safe), and
 * each output's knowability. A port — the real vendored-kit-backed
 * implementation is Phase 4's `Kit` loading adapter; Phase 3's resolution
 * agents are tested against a fake.
 */
export interface Realization {
  classPreset(
    category: Category,
    type: string,
    className: string,
  ): Promise<ClassPreset | undefined>;
  defaultFor(
    category: Category,
    type: string,
    concern: string,
  ): Promise<number | boolean | string | undefined>;
  boundFor(
    category: Category,
    type: string,
    concern: string,
  ): Promise<Bound | undefined>;
  supportsCapability(
    category: Category,
    type: string,
    capability: string,
  ): Promise<boolean>;
  /** Not consumed until Phase 5's `ReferenceResolver` — declared now so `Realization`'s shape doesn't change once Render lands. */
  knowabilityOf(category: Category, type: string, output: string): Promise<Knowability>;
}
