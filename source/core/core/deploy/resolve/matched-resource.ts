import type { Category } from "../workload.ts";
import type { ResourceDeclaration } from "../resource.ts";
import type { ResourceContract } from "../contracts/contract.ts";

/** A resource declaration once `ContractMatcher` has matched it to its interface contract and confirmed it's valid — everything downstream (`ProvisionerSelector`, `ValueNegotiator`, `RequestAssembler`) works from this, never the bare declaration. */
export interface MatchedResource {
  readonly category: Category;
  readonly name: string;
  readonly declaration: ResourceDeclaration;
  readonly contract: ResourceContract;
}
