import type {
  KitConfig,
  TargetValueOverrides,
  TargetValuesConfig,
} from "./config.ts";

/**
 * Merges a kit's config layers into one effective `KitConfig` — the single
 * place this repo implements kit-config precedence (Section 10: "implement
 * the merge in one place with the strategy stated in comments"). Layers are
 * given lowest-precedence-first (e.g. `[projectDefaults, perDeveloperLocal]`);
 * a later layer always wins a conflict.
 *
 * Each concern merges differently, because each concern *is* different data:
 *   - `behavior`: a flat bag: shallow-merged key by key, later layer wins.
 *   - `provisionerCatalog`: an ORDERED list, not a keyed bag — concatenated
 *     with later (higher-precedence) layers placed FIRST, since first-match
 *     selection means "wins a conflict" for a provisioner means "is tried
 *     before the others" (Section 10's shadowing-by-ordering).
 *   - `targetValues`: keyed by `category.type`; within one entry,
 *     `classPresets`/`defaults`/`bounds` each shallow-merge their own keys,
 *     later layer wins per key (not per `category.type` as a whole, so one
 *     layer can override just one class's preset without clobbering another
 *     class the base layer already set for the same type).
 */
export class KitConfigMerger {
  merge(layers: readonly KitConfig[]): KitConfig {
    return layers.reduce(
      (acc, layer) => ({
        behavior: { ...acc.behavior, ...layer.behavior },
        provisionerCatalog: {
          provisioners: [
            ...layer.provisionerCatalog.provisioners,
            ...acc.provisionerCatalog.provisioners,
          ],
        },
        targetValues: this.mergeTargetValues(
          acc.targetValues,
          layer.targetValues,
        ),
      }),
      {
        behavior: {},
        provisionerCatalog: { provisioners: [] },
        targetValues: {},
      } as KitConfig,
    );
  }

  private mergeTargetValues(
    base: TargetValuesConfig,
    layer: TargetValuesConfig,
  ): TargetValuesConfig {
    const merged: Record<string, TargetValueOverrides> = { ...base };
    for (const [key, overrides] of Object.entries(layer)) {
      const existing = merged[key];
      merged[key] = {
        classPresets: this.mergeClassPresets(
          existing?.classPresets,
          overrides.classPresets,
        ),
        defaults: { ...existing?.defaults, ...overrides.defaults },
        bounds: { ...existing?.bounds, ...overrides.bounds },
      };
    }
    return merged;
  }

  private mergeClassPresets(
    base: TargetValueOverrides["classPresets"],
    layer: TargetValueOverrides["classPresets"],
  ): TargetValueOverrides["classPresets"] {
    const merged: Record<string, Record<string, number | boolean | string>> = {
      ...base,
    };
    for (const [className, values] of Object.entries(layer ?? {})) {
      merged[className] = { ...merged[className], ...values };
    }
    return merged;
  }
}
