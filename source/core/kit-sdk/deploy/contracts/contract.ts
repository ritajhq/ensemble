import type { Category } from "../workload.ts";
import type { ResourceDeclaration } from "../resource.ts";
import { KeySuggester } from "../manifest/key-suggester.ts";
import { ContractError } from "./errors.ts";

/** The ordered, portable core class vocabulary (Section 2) — every contract accepts the full vocabulary at the interface layer; a realization decides what each class expands to (Phase 4/5). */
export const CORE_CLASSES = ["ephemeral", "standard", "critical"] as const;

export type ScalarType = "string" | "number" | "boolean" | "object";

/** A **param** field (bin = param, Section 7): developer-owned, platform-indifferent, passed through untouched once validated. */
export interface ParamField {
  readonly name: string;
  readonly required: boolean;
  readonly type: ScalarType;
}

/** A capability the interface declares *exists* for this type — whether a given kit can *satisfy* it is a realization concern (Phase 4+, "undeclared support defaults to not satisfied", Section 11). */
export interface CapabilityDeclaration {
  readonly name: string;
  /** Whether this capability carries a quantity (`read-replicas: 2`) rather than a plain boolean. */
  readonly quantified: boolean;
}

/**
 * The interface layer of a Type's contract (Section 6) — shared and portable
 * across every kit that implements it. Owns its own validation: a contract is
 * the one domain object that knows what makes a resource declaration of its
 * Type valid, so resources are checked by asking the contract, not by an
 * external procedure reaching into both.
 *
 * Bin tagging (Section 7) is structural, not a per-field flag: everything in
 * `params` is bin=param by construction, everything in `negotiatedConcerns` is
 * bin=negotiated. Bin=platform-only fields never appear in a manifest, so the
 * interface layer — which exists to describe what a manifest may say — has
 * nothing to declare for that bin; it belongs entirely to the realization/kit
 * config (Section 10).
 */
export class ResourceContract {
  constructor(
    readonly category: Category,
    readonly type: string,
    readonly version: string,
    readonly params: readonly ParamField[],
    readonly negotiatedConcerns: readonly string[],
    readonly capabilities: readonly CapabilityDeclaration[],
    readonly outputs: readonly string[],
    readonly classes: readonly string[] = CORE_CLASSES,
    private readonly keySuggester: KeySuggester = new KeySuggester(),
  ) {}

  /** The `category.type` this contract governs — how a `ContractRegistry` keys its lookups. */
  get id(): string {
    return `${this.category}.${this.type}`;
  }

  /** Every concern the `ValueNegotiator` must resolve a value for: the declared negotiated concerns, plus any quantified capability's name — a capability's quantity is resolved and clamped exactly like a preset-derived value (Section 7: "subject to the same bound mechanism as presets"). A boolean capability carries no value to negotiate, only a support check (`ProvisionerSelector`'s job), so it's excluded. */
  get resolvableConcerns(): readonly string[] {
    const quantifiedCapabilities = this.capabilities.filter((c) => c.quantified)
      .map((c) => c.name);
    return [
      ...new Set([...this.negotiatedConcerns, ...quantifiedCapabilities]),
    ];
  }

  /** Validates a resource declaration already matched to this contract by type: every declared param is known and correctly typed, every required param is present, `class` (if set) is in this contract's vocabulary, and every capability (if set) is declared and correctly shaped. Throws `ContractError` naming the first violation. */
  validate(resource: ResourceDeclaration): void {
    this.validateParams(resource);
    this.validateClass(resource);
    this.validateCapabilities(resource);
  }

  private validateParams(resource: ResourceDeclaration): void {
    const known = this.params.map((p) => p.name);

    for (const key of Object.keys(resource.params)) {
      if (known.includes(key)) continue;
      const suggestion = this.keySuggester.suggestFor(key, known);
      const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
      throw new ContractError(`${this.id} has no param "${key}".${hint}`);
    }

    for (const field of this.params) {
      const value = resource.params[field.name];
      if (value === undefined) {
        if (field.required) {
          throw new ContractError(`${this.id} requires param "${field.name}".`);
        }
        continue;
      }
      if (!this.matchesType(value, field.type)) {
        throw new ContractError(
          `${this.id} param "${field.name}" must be a ${field.type}.`,
        );
      }
    }
  }

  private validateClass(resource: ResourceDeclaration): void {
    if (resource.class === undefined) return;
    if (!this.classes.includes(resource.class)) {
      throw new ContractError(
        `${this.id} does not support class "${resource.class}" (expected one of: ${
          this.classes.join(", ")
        }).`,
      );
    }
  }

  private validateCapabilities(resource: ResourceDeclaration): void {
    if (resource.capabilities === undefined) return;
    const known = this.capabilities.map((c) => c.name);

    for (const [name, value] of Object.entries(resource.capabilities)) {
      const declaration = this.capabilities.find((c) => c.name === name);
      if (!declaration) {
        const suggestion = this.keySuggester.suggestFor(name, known);
        const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
        throw new ContractError(
          `${this.id} has no capability "${name}".${hint}`,
        );
      }
      const matches = declaration.quantified
        ? typeof value === "number"
        : typeof value === "boolean";
      if (!matches) {
        const expected = declaration.quantified ? "number" : "boolean";
        throw new ContractError(
          `${this.id} capability "${name}" must be a ${expected}.`,
        );
      }
    }
  }

  private matchesType(value: unknown, type: ScalarType): boolean {
    switch (type) {
      case "object":
        return typeof value === "object" && value !== null &&
          !Array.isArray(value);
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
    }
  }
}
