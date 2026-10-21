import type { Realization } from "../kit/realization.ts";
import type { Target } from "../kit/target.ts";
import type { MatchedResource } from "./matched-resource.ts";
import type { ResolvedValue, ResolvedValues } from "./resolved-values.ts";

/** A pin the target's kit can't honor: the developer chose a specific tech that kit doesn't provide for the type. */
export class EngineNotProvidedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineNotProvidedError";
  }
}

/**
 * Resolves every negotiated concern a resource's contract declares (Section
 * 7): the developer's own pin (a param named like the concern, `engine:
 * postgres`) or capability expression, if any → else the class preset → else
 * the platform default; then clamps to the platform bound, recording
 * provenance and — on a clamp — a warning at every step. A pinned `engine`
 * must be one the kit provides for the type.
 */
export class ValueNegotiator {
  async negotiate(
    resource: MatchedResource,
    target: Target,
  ): Promise<ResolvedValues> {
    const realization = await target.kit.realization();
    const values: Record<string, ResolvedValue> = {};
    const warnings: string[] = [];

    for (const concern of resource.contract.resolvableConcerns) {
      const resolved = await this.resolveConcern(
        resource,
        realization,
        concern,
      );
      if (!resolved) continue;
      if (concern === "engine") {
        await this.assertProvided(
          resource,
          realization,
          String(resolved.value),
          resolved.provenance,
        );
      }
      values[concern] = await this.clamp(
        resource,
        realization,
        concern,
        resolved,
        warnings,
      );
    }

    return { values, warnings };
  }

  private async resolveConcern(
    resource: MatchedResource,
    realization: Realization,
    concern: string,
  ): Promise<ResolvedValue | undefined> {
    const pinned = resource.declaration.params[concern];
    if (
      typeof pinned === "string" &&
      resource.contract.params.some((p) => p.name === concern)
    ) {
      return { value: pinned, provenance: "pin" };
    }

    const capabilityValue = resource.declaration.capabilities?.[concern];
    if (capabilityValue !== undefined) {
      return { value: capabilityValue, provenance: "capability" };
    }

    if (resource.declaration.class !== undefined) {
      const preset = await realization.classPreset(
        resource.category,
        resource.declaration.type,
        resource.declaration.class,
      );
      const presetValue = preset?.concernValues[concern];
      if (presetValue !== undefined) {
        return { value: presetValue, provenance: "preset" };
      }
    }

    const defaultValue = await realization.defaultFor(
      resource.category,
      resource.declaration.type,
      concern,
    );
    return defaultValue === undefined
      ? undefined
      : { value: defaultValue, provenance: "default" };
  }

  /** The explicit trade-off of an engine: honored only where the kit provides it, and refused, naming what the kit does provide, where it doesn't — whether the developer pinned it or a platform's kit config made it the default. */
  private async assertProvided(
    resource: MatchedResource,
    realization: Realization,
    engine: string,
    provenance: string,
  ): Promise<void> {
    const provided = await realization.enginesFor?.(
      resource.category,
      resource.declaration.type,
    );
    if (!provided || provided.includes(engine)) return;
    const advice = provenance === "pin"
      ? `Remove the pin to take what the kit provides, or deploy with a kit that provides ${engine}.`
      : `It was set as the default in this kit's config (targetValues); change it there.`;
    throw new EngineNotProvidedError(
      `${resource.category}.${resource.name}: engine "${engine}" isn't one this kit provides for ${resource.declaration.type} ` +
        `(it provides: ${provided.join(", ")}). ${advice}`,
    );
  }

  private async clamp(
    resource: MatchedResource,
    realization: Realization,
    concern: string,
    resolved: ResolvedValue,
    warnings: string[],
  ): Promise<ResolvedValue> {
    if (typeof resolved.value !== "number") return resolved;
    const bound = await realization.boundFor(
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
