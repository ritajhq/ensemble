import type { Category } from "../workload.ts";
import type { ResourceDeclaration } from "../resource.ts";
import type { ContractRegistry } from "../contracts/registry.ts";
import { ContractError } from "../contracts/errors.ts";
import { ManifestPath, type Problem } from "../problem.ts";
import type { MatchedResource } from "./matched-resource.ts";

/** Matches a resource declaration to its interface contract and confirms it's valid — the entry point into resolution. */
export class ContractMatcher {
  constructor(private readonly registry: ContractRegistry) {}

  /** Throws `ContractError`, naming every problem `problemsOf` finds, if the declared type has no contract in this category or the contract rejects the declaration. */
  match(
    category: Category,
    name: string,
    declaration: ResourceDeclaration,
  ): MatchedResource {
    const problems = this.problemsOf(category, name, declaration);
    if (problems.length > 0) throw new ContractError(problems);
    const contract = this.registry.contractFor(category, declaration.type)!;
    return { category, name, declaration, contract };
  }

  /** Why the declaration can't be matched: its type has no contract in this category, or the contract rejects it (missing/mistyped param, unsupported class, undeclared capability). Empty when it matches. */
  problemsOf(
    category: Category,
    name: string,
    declaration: ResourceDeclaration,
  ): Problem[] {
    const at = ManifestPath.resource(category, name);
    const contract = this.registry.contractFor(category, declaration.type);
    if (!contract) {
      return [
        at.child("type").problem(
          `${category}.${name} has unknown type "${declaration.type}".`,
        ),
      ];
    }
    return contract.problemsOf(declaration, at);
  }
}
