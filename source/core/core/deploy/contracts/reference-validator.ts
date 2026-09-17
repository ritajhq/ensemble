import { CATEGORIES, type Category, type Workload } from "../workload.ts";
import { ReferenceSyntax } from "../reference.ts";
import type { Reference } from "../reference.ts";
import type { ContractRegistry } from "./registry.ts";
import { ContractError } from "./errors.ts";

/**
 * Walks every resource's params for `${...}` references and checks each one
 * targets something real: a declared output key on the target's contract, or
 * — for a `compute` target — one of its own declared `ports`. Deliberately
 * narrower than the full `DependencyGraph` (Phase 3): it does not detect
 * cycles and does not order anything, it only answers "does this reference
 * point at a real, contractually-declared thing?" — a local, per-reference
 * question the contracts already have the data to answer, versus the
 * whole-workload structural questions Phase 3's graph owns.
 */
export class ReferenceValidator {
  constructor(
    private readonly registry: ContractRegistry,
    private readonly syntax: ReferenceSyntax = new ReferenceSyntax(),
  ) {}

  /** Throws `ContractError` naming the first reference that targets an undeclared output, an undeclared port, or a resource that doesn't exist in the workload. Sugar `${release.name}` references are accepted whenever the named release is declared — no output key to check. */
  validate(workload: Workload): void {
    for (const category of CATEGORIES) {
      const resources = workload[category] as
        | Record<string, unknown>
        | undefined;
      if (!resources) continue;

      for (const [name, resource] of Object.entries(resources)) {
        this.validateResourceParams(workload, `${category}.${name}`, resource);
      }
    }
  }

  private validateResourceParams(
    workload: Workload,
    path: string,
    resource: unknown,
  ): void {
    const params = (resource as { params?: Record<string, unknown> }).params;
    if (!params) return;

    for (const [field, value] of Object.entries(params)) {
      this.validateValue(workload, `${path}.${field}`, value);
    }
  }

  /** A param's value may itself be a mapping (e.g. `env: { DATABASE_URL: ${...} }`) or a list (e.g. `networks: [${...}]`) — references can appear one level inside either, so this recurses into plain objects and arrays rather than only checking the param's own top-level value. */
  private validateValue(
    workload: Workload,
    path: string,
    value: unknown,
  ): void {
    const reference = this.syntax.parse(value);
    if (reference) {
      this.validateReference(workload, path, reference);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.validateValue(workload, `${path}[${index}]`, item)
      );
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (
        const [key, nested] of Object.entries(value as Record<string, unknown>)
      ) {
        this.validateValue(workload, `${path}.${key}`, nested);
      }
    }
  }

  private validateReference(
    workload: Workload,
    path: string,
    reference: Reference,
  ): void {
    if (reference.category === "release") {
      if (!workload.release?.[reference.name]) {
        throw new ContractError(
          `${path} references undeclared release "${reference.name}".`,
        );
      }
      return;
    }

    if (!(CATEGORIES as readonly string[]).includes(reference.category)) {
      throw new ContractError(
        `${path} references unknown category "${reference.category}".`,
      );
    }
    const category = reference.category as Category;

    if (category === "external") {
      this.validateExternalReference(workload, path, reference);
      return;
    }

    const target = (workload[category] as
      | Record<string, { type: string; params: Record<string, unknown> }>
      | undefined)
      ?.[reference.name];
    if (!target) {
      throw new ContractError(
        `${path} references undeclared resource "${category}.${reference.name}".`,
      );
    }

    const output = reference.output!;
    if (category === "compute" && this.hasPort(target, output)) return;

    const contract = this.registry.contractFor(category, target.type);
    if (!contract) {
      throw new ContractError(
        `${path} references "${category}.${reference.name}" of unknown type "${target.type}".`,
      );
    }
    if (!contract.outputs.includes(output)) {
      throw new ContractError(
        `${path} references undeclared output "${output}" on ${contract.id} (declared outputs: ${
          contract.outputs.join(", ") || "none"
        }).`,
      );
    }
  }

  /** `external` entries have no contract (Section 5: "provisioned by nothing") — a reference into one names one of `ExternalDeclaration`'s own fields (`type` or `name`) rather than a contract-declared output. */
  private validateExternalReference(
    workload: Workload,
    path: string,
    reference: Reference,
  ): void {
    if (!workload.external?.[reference.name]) {
      throw new ContractError(
        `${path} references undeclared resource "external.${reference.name}".`,
      );
    }
    const output = reference.output!;
    if (output !== "type" && output !== "name") {
      throw new ContractError(
        `${path} references undeclared field "${output}" on external.${reference.name} (declared fields: type, name).`,
      );
    }
  }

  private hasPort(
    target: { params: Record<string, unknown> },
    output: string,
  ): boolean {
    const ports = target.params.ports;
    return typeof ports === "object" && ports !== null && output in ports;
  }
}
