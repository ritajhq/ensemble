import type { Realization } from "../kit/realization.ts";
import type { Target } from "../kit/target.ts";
import type { MatchedResource } from "./matched-resource.ts";
import type { ResolvedValue, ResolvedValues } from "./resolved-values.ts";

/**
 * Resolves every negotiated concern a resource's contract declares (Section
 * 7): the developer's own capability expression, if any → else the class
 * preset → else the platform default; then clamps to the platform bound,
 * recording provenance and — on a clamp — a warning at every step.
 */
export class ValueNegotiator {
  negotiate(resource: MatchedResource, target: Target): ResolvedValues {
    const realization = target.kit.realization();
    const values: Record<string, ResolvedValue> = {};
    const warnings: string[] = [];

    for (const concern of resource.contract.resolvableConcerns) {
      const resolved = this.resolveConcern(resource, realization, concern);
      if (!resolved) continue;
      values[concern] = this.clamp(
        resource,
        realization,
        concern,
        resolved,
        warnings,
      );
    }

    return { values, warnings };
  }

  private resolveConcern(
    resource: MatchedResource,
    realization: Realization,
    concern: string,
  ): ResolvedValue | undefined {
    const capabilityValue = resource.declaration.capabilities?.[concern];
    if (capabilityValue !== undefined) {
      return { value: capabilityValue, provenance: "capability" };
    }

    if (resource.declaration.class !== undefined) {
      const preset = realization.classPreset(
        resource.category,
        resource.declaration.type,
        resource.declaration.class,
      );
      const presetValue = preset?.concernValues[concern];
      if (presetValue !== undefined) {
        return { value: presetValue, provenance: "preset" };
      }
    }

    const defaultValue = realization.defaultFor(
      resource.category,
      resource.declaration.type,
      concern,
    );
    return defaultValue === undefined
      ? undefined
      : { value: defaultValue, provenance: "default" };
  }

  private clamp(
    resource: MatchedResource,
    realization: Realization,
    concern: string,
    resolved: ResolvedValue,
    warnings: string[],
  ): ResolvedValue {
    if (typeof resolved.value !== "number") return resolved;
    const bound = realization.boundFor(
      resource.category,
      resource.declaration.type,
      concern,
    );
    if (!bound) return resolved;

    if (bound.max !== undefined && resolved.value > bound.max) {
      warnings.push(
        `${resource.category}.${resource.name}: "${concern}" clamped from ${resolved.value} to ${bound.max} (platform bound).`,
      );
      return { value: bound.max, provenance: "clamp" };
    }
    if (bound.min !== undefined && resolved.value < bound.min) {
      warnings.push(
        `${resource.category}.${resource.name}: "${concern}" clamped from ${resolved.value} to ${bound.min} (platform bound).`,
      );
      return { value: bound.min, provenance: "clamp" };
    }
    return resolved;
  }
}
