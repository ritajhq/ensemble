import type { Category } from "../workload.ts";
import type {
  Bound,
  ClassPreset,
  Knowability,
  Realization,
} from "./realization.ts";
import type { TargetValuesConfig } from "./config.ts";

/**
 * Wraps a kit's own built-in `Realization` with a project's per-target
 * overrides (Section 10's third config concern), checking the override first
 * and falling back to the kit's own values. A class-preset override replaces
 * the kit's preset for that class *entirely* rather than merging concern by
 * concern — "overridable" (Section 6) reads as substitution, and partial
 * per-concern merging between a code-level preset and a config-level one
 * would be a confusing, unstated semantic to invent. Capability support and
 * output knowability are kit facts, not something Section 10 lists as
 * project-overridable, so those two always pass straight through.
 */
export class LayeredRealization implements Realization {
  constructor(
    private readonly overrides: TargetValuesConfig,
    private readonly underlying: Realization,
  ) {}

  classPreset(
    category: Category,
    type: string,
    className: string,
  ): ClassPreset | undefined {
    const override = this.overrides[`${category}.${type}`]?.classPresets
      ?.[className];
    if (override) return { concernValues: override };
    return this.underlying.classPreset(category, type, className);
  }

  defaultFor(
    category: Category,
    type: string,
    concern: string,
  ): number | boolean | string | undefined {
    const override = this.overrides[`${category}.${type}`]?.defaults?.[concern];
    if (override !== undefined) return override;
    return this.underlying.defaultFor(category, type, concern);
  }

  boundFor(
    category: Category,
    type: string,
    concern: string,
  ): Bound | undefined {
    const override = this.overrides[`${category}.${type}`]?.bounds?.[concern];
    if (override) return override;
    return this.underlying.boundFor(category, type, concern);
  }

  supportsCapability(
    category: Category,
    type: string,
    capability: string,
  ): boolean {
    return this.underlying.supportsCapability(category, type, capability);
  }

  knowabilityOf(category: Category, type: string, output: string): Knowability {
    return this.underlying.knowabilityOf(category, type, output);
  }
}
