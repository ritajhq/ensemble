/**
 * Kit behavior settings (concern a, Section 10) — how the kit itself
 * operates, independent of any one resource type. Each kit declares its own
 * schema for this (the typed replacement for the old opaque `overrides`); at
 * the SDK level it stays a validated-by-nobody-but-the-kit bag, since only the
 * kit's own code knows what its settings mean.
 */
export type KitBehaviorConfig = Readonly<Record<string, unknown>>;

/** How a project-declared provisioner is implemented (Section 10's extension ladder, rungs 2–3): a `template` emits an artifact from pure data, a `command` shells out. */
export type ProvisionerImplementation =
  | {
    readonly kind: "template";
    readonly data: Readonly<Record<string, unknown>>;
  }
  | { readonly kind: "command"; readonly command: string };

/**
 * A project-declared provisioner entry — either a brand-new provisioner for a
 * type the kit doesn't cover, or one that shadows a kit default by matching
 * more specifically. Matches on `type` (required) and optionally `class`,
 * `id`, `capabilities`, and `category` (Section 10's "target" — the resource's
 * category, since "target" already names something else in this domain,
 * Section 2). Shadowing isn't expressed by an explicit override key: it falls
 * out of ordering (Section 10) — project entries are always tried before kit
 * defaults in `ProvisionerSelector`'s first-match walk, so a more specific
 * project entry simply wins first.
 */
export interface ProvisionerConfigEntry {
  readonly id?: string;
  readonly type: string;
  readonly class?: string;
  readonly capabilities?: readonly string[];
  readonly category?: string;
  readonly implementation: ProvisionerImplementation;
}

/** The provisioner catalog (concern b, Section 10) — every project-declared provisioner, kept as an ordered list (order is significant: first-match). */
export interface ProvisionerCatalogConfig {
  readonly provisioners: readonly ProvisionerConfigEntry[];
}

/** One class's preset override, or one concern's bound override, keyed by `category.type`. */
export interface TargetValueOverrides {
  readonly classPresets?: Readonly<
    Record<string, Readonly<Record<string, number | boolean | string>>>
  >;
  readonly defaults?: Readonly<Record<string, number | boolean | string>>;
  readonly bounds?: Readonly<Record<string, { max?: number; min?: number }>>;
}

/** Per-target values (concern c, Section 10) — platform overrides of a kit's built-in class presets, defaults, and bounds, keyed by `category.type`. */
export type TargetValuesConfig = Readonly<Record<string, TargetValueOverrides>>;

/**
 * Kit-defined selection keys (concern d, the watch/develop plan's Section
 * 5) — opaque values a kit's own `when` clauses test during provisioner
 * selection (e.g. `runtime`). Distinct in role from `behavior` (kit-wide
 * operational settings the kit itself reads) and `targetValues` (value/
 * preset/bound overrides the `ValueNegotiator` reads): this is what
 * `ProvisionerSelector` reads. ens never interprets a selection value's
 * meaning — it only ever hands it to the kit's own `matches()`.
 */
export type KitSelectionConfig = Readonly<Record<string, unknown>>;

/**
 * A kit's sidecar project config — the concerns Section 10 requires be "kept
 * separate (do not merge into one blob)". Kept as distinct sections here
 * (structurally separated) rather than separate files; either satisfies
 * "kept separate" — this repo uses one file per kit for simplicity, flagged
 * in the Phase 4 report as a judgment call.
 */
export interface KitConfig {
  readonly behavior: KitBehaviorConfig;
  readonly provisionerCatalog: ProvisionerCatalogConfig;
  readonly targetValues: TargetValuesConfig;
  readonly selection: KitSelectionConfig;
}

export const EMPTY_KIT_CONFIG: KitConfig = {
  behavior: {},
  provisionerCatalog: { provisioners: [] },
  targetValues: {},
  selection: {},
};
