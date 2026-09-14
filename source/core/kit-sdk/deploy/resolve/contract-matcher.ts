import type { Category } from "../workload.ts";
import type { ResourceDeclaration } from "../resource.ts";
import type { ContractRegistry } from "../contracts/registry.ts";
import { ContractError } from "../contracts/errors.ts";
import type { MatchedResource } from "./matched-resource.ts";

/** Matches a resource declaration to its interface contract and confirms it's valid — the entry point into resolution. */
export class ContractMatcher {
  constructor(private readonly registry: ContractRegistry) {}

  /** Throws `ContractError` if the declared type has no contract in this category, or if the contract rejects the declaration (missing/mistyped param, unsupported class, undeclared capability). */
  match(
    category: Category,
    name: string,
    declaration: ResourceDeclaration,
  ): MatchedResource {
    const contract = this.registry.contractFor(category, declaration.type);
    if (!contract) {
      throw new ContractError(
        `${category}.${name} has unknown type "${declaration.type}".`,
      );
    }
    contract.validate(declaration);
    return { category, name, declaration, contract };
  }
}
