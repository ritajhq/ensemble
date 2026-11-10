import type { Workload } from "../workload.ts";
import type { ResourceDeclaration } from "../resource.ts";
import type { ContractRegistry } from "../contracts/registry.ts";
import { ContractError } from "../contracts/errors.ts";
import { ReferenceValidator } from "../contracts/reference-validator.ts";
import type { Problem } from "../problem.ts";
import { ContractMatcher } from "./contract-matcher.ts";
import { RESOLVABLE_CATEGORIES } from "./workload-resolver.ts";

/**
 * Checks a parsed workload against the contracts before anything resolves:
 * every resource's type and fields, then every `${...}` reference. Reports
 * all of it at once, so a deploy names every problem rather than the first,
 * and an editor can mark each one.
 */
export class WorkloadValidator {
  constructor(
    registry: ContractRegistry,
    private readonly matcher: ContractMatcher = new ContractMatcher(registry),
    private readonly references: ReferenceValidator = new ReferenceValidator(
      registry,
    ),
  ) {}

  /** Throws `ContractError` naming every problem `problemsOf` finds. */
  validate(workload: Workload): void {
    const problems = this.problemsOf(workload);
    if (problems.length > 0) throw new ContractError(problems);
  }

  /** Every contract and reference problem in the workload, each at the node it's about. */
  problemsOf(workload: Workload): Problem[] {
    return [
      ...this.contractProblemsOf(workload),
      ...this.references.problemsOf(workload),
    ];
  }

  private contractProblemsOf(workload: Workload): Problem[] {
    const problems: Problem[] = [];
    for (const category of RESOLVABLE_CATEGORIES) {
      const resources: Readonly<Record<string, ResourceDeclaration>> =
        workload[category] ?? {};
      for (const [name, declaration] of Object.entries(resources)) {
        // Without a type there is no contract to ask; the parser has
        // already said the type is missing.
        if (typeof declaration.type !== "string" || !declaration.type) continue;
        problems.push(
          ...this.matcher.problemsOf(category, name, declaration),
        );
      }
    }
    return problems;
  }
}
