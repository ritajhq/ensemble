import { CATEGORIES, type Category, type Workload } from "../workload.ts";
import type { Reference } from "../reference.ts";
import type { ResourceDeclaration } from "../resource.ts";
import type { ContractRegistry } from "./registry.ts";

/** One thing a `${...}` reference can name, with a short human description of what it is (e.g. "relational.v1 output"). */
export interface ReferenceTarget {
  readonly reference: Reference;
  readonly detail: string;
}

/** `external` and `variables` entries have no contract, so their referenceable fields are fixed by their declaration shape. */
const DECLARATION_FIELDS: Partial<Record<Category, readonly string[]>> = {
  external: ["type", "name"],
  variables: ["value"],
};

/** A deployment's own identity, which only a task's arguments can reference (see `../task.ts`). */
const DEPLOYMENT_FIELDS = ["name", "artifact", "root"] as const;

/**
 * The inverse of `ReferenceValidator`: instead of checking that one reference
 * targets something real, lists every target a workload makes available — a
 * release, an `external`/`variables` field, a contract-declared output, or a
 * compute's port. Kept beside the validator so the two can't disagree on what
 * is referenceable.
 */
export class ReferenceTargets {
  constructor(private readonly registry: ContractRegistry) {}

  /** Every target a resource param may reference in `workload`. Resources of an unknown type contribute nothing rather than failing — an editor asks this of manifests mid-edit. */
  ofWorkload(workload: Workload): ReferenceTarget[] {
    const releases = Object.keys(workload.release ?? {}).map((name) => ({
      reference: { category: "release", name },
      detail: "release",
    }));
    const resources = CATEGORIES.flatMap((category) => this.ofCategory(workload, category));
    return [...releases, ...resources];
  }

  /** The `${deployment.*}` targets, which a task's arguments may reference on top of `ofWorkload`'s. */
  ofDeployment(): ReferenceTarget[] {
    return DEPLOYMENT_FIELDS.map((name) => ({
      reference: { category: "deployment", name },
      detail: "deployment",
    }));
  }

  private ofCategory(workload: Workload, category: Category): ReferenceTarget[] {
    const resources = workload[category] as Record<string, unknown> | undefined;
    if (!resources) return [];

    return Object.entries(resources).flatMap(([name, resource]) =>
      this.outputsOf(category, resource).map(({ output, detail }) => ({
        reference: { category, name, output },
        detail,
      }))
    );
  }

  private outputsOf(category: Category, resource: unknown): { output: string; detail: string }[] {
    const fields = DECLARATION_FIELDS[category];
    if (fields) return fields.map((output) => ({ output, detail: `${category} field` }));

    const declaration = resource as Partial<ResourceDeclaration>;
    const contract = declaration.type ? this.registry.contractFor(category, declaration.type) : undefined;
    if (!contract) return [];

    const outputs = contract.outputs.map((output) => ({ output, detail: `${contract.id} output` }));
    if (category !== "compute") return outputs;

    const ports = Object.keys(this.portsOf(declaration)).map((output) => ({ output, detail: "port" }));
    return [...outputs, ...ports];
  }

  private portsOf(declaration: Partial<ResourceDeclaration>): Record<string, unknown> {
    const ports = (declaration.params as Record<string, unknown> | undefined)?.ports;
    return typeof ports === "object" && ports !== null ? ports as Record<string, unknown> : {};
  }
}
