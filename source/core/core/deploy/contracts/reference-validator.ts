import { CATEGORIES, type Category, type Workload } from "../workload.ts";
import { ReferenceSyntax, ReferenceSyntaxError } from "../reference.ts";
import { ComputeAddress } from "../compute-address.ts";
import type { Reference } from "../reference.ts";
import type { ContractRegistry } from "./registry.ts";
import { ContractError } from "./errors.ts";
import { ManifestPath, type Problem } from "../problem.ts";

/**
 * Walks every resource's params for `${...}` references and checks each one
 * targets something real: a declared output key on the target's contract, or
 * — for a `compute` target — its `host` or one of its own declared `ports`. Deliberately
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

  /** Throws `ContractError` naming every reference `problemsOf` finds wrong. */
  validate(workload: Workload): void {
    const problems = this.problemsOf(workload);
    if (problems.length > 0) throw new ContractError(problems);
  }

  /** Every reference that targets an undeclared output, an undeclared port, or a resource that doesn't exist in the workload, each at the field holding it. Sugar `${release.name}` references are accepted whenever the named release is declared — no output key to check. */
  problemsOf(workload: Workload): Problem[] {
    const problems: Problem[] = [];
    for (const category of CATEGORIES) {
      const resources = workload[category] as
        | Record<string, unknown>
        | undefined;
      if (!resources) continue;

      for (const [name, resource] of Object.entries(resources)) {
        const params = (resource as { params?: Record<string, unknown> })
          .params;
        if (!params) continue;
        const at = ManifestPath.resource(category, name);
        for (const [field, value] of Object.entries(params)) {
          this.checkValue(workload, at.child(field), value, problems);
        }
      }
    }
    return problems;
  }

  /** A param's value may itself be a mapping (e.g. `env: { DATABASE_URL: ${...} }`) or a list (e.g. `networks: [${...}]`) — references can appear inside either, so this recurses into plain objects and arrays rather than only checking the param's own top-level value. */
  private checkValue(
    workload: Workload,
    at: ManifestPath,
    value: unknown,
    problems: Problem[],
  ): void {
    let references: Reference[];
    try {
      const whole = this.syntax.parse(value);
      references = whole
        ? [whole]
        : this.syntax.embedded(value).map(({ reference }) => reference);
    } catch (error) {
      if (!(error instanceof ReferenceSyntaxError)) throw error;
      problems.push(at.problem(`${at} holds ${error.message}`));
      return;
    }
    for (const reference of references) {
      this.checkReference(workload, at, reference, problems);
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.checkValue(workload, at.child(index), item, problems)
      );
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (
        const [key, nested] of Object.entries(value as Record<string, unknown>)
      ) {
        this.checkValue(workload, at.child(key), nested, problems);
      }
    }
  }

  private checkReference(
    workload: Workload,
    at: ManifestPath,
    reference: Reference,
    problems: Problem[],
  ): void {
    const problem = this.problemWith(workload, `${at}`, reference);
    if (problem) problems.push(at.problem(problem));
  }

  /** What's wrong with one reference, as the sentence to print, or undefined when it targets something real. */
  private problemWith(
    workload: Workload,
    path: string,
    reference: Reference,
  ): string | undefined {
    if (reference.category === "release") {
      if (workload.release?.[reference.name]) return undefined;
      return `${path} references undeclared release "${reference.name}".`;
    }

    if (!(CATEGORIES as readonly string[]).includes(reference.category)) {
      return `${path} references unknown category "${reference.category}".`;
    }
    const category = reference.category as Category;

    if (category === "external") {
      return this.externalProblem(workload, path, reference);
    }
    if (category === "variables") {
      return this.variableProblem(workload, path, reference);
    }

    const target = (workload[category] as
      | Record<string, { type: string; params: Record<string, unknown> }>
      | undefined)
      ?.[reference.name];
    if (!target) {
      return `${path} references undeclared resource "${category}.${reference.name}".`;
    }

    const output = reference.output!;
    if (ComputeAddress.names(reference, workload)) return undefined;

    const contract = this.registry.contractFor(category, target.type);
    if (!contract) {
      return `${path} references "${category}.${reference.name}" of unknown type "${target.type}".`;
    }
    if (contract.outputs.includes(output)) return undefined;
    return `${path} references undeclared output "${output}" on ${contract.id} (declared outputs: ${
      contract.outputs.join(", ") || "none"
    }).`;
  }

  /** `external` entries have no contract (Section 5: "provisioned by nothing") — a reference into one names one of `ExternalDeclaration`'s own fields (`type` or `name`) rather than a contract-declared output. */
  private externalProblem(
    workload: Workload,
    path: string,
    reference: Reference,
  ): string | undefined {
    if (!workload.external?.[reference.name]) {
      return `${path} references undeclared resource "external.${reference.name}".`;
    }
    const output = reference.output!;
    if (output === "type" || output === "name") return undefined;
    return `${path} references undeclared field "${output}" on external.${reference.name} (declared fields: type, name).`;
  }

  /** `variables` entries have no contract either — the same reasoning as `external` (Section 5: developer-supplied data, no provisioner) — a reference names one of `VariableDeclaration`'s own fields, of which `value` (the resolved value: process env, or `default`) is the only one a reference can target. */
  private variableProblem(
    workload: Workload,
    path: string,
    reference: Reference,
  ): string | undefined {
    if (!workload.variables?.[reference.name]) {
      return `${path} references undeclared resource "variables.${reference.name}".`;
    }
    if (reference.output === "value") return undefined;
    return `${path} references undeclared field "${reference.output}" on variables.${reference.name} (declared fields: value).`;
  }
}
