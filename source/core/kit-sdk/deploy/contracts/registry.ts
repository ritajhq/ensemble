import type { Category } from "../workload.ts";
import type { ResourceContract } from "./contract.ts";

/** The port through which resolution agents look up a Type's interface contract — never a concrete lookup table reached into directly (DIP). */
export interface ContractRegistry {
  contractFor(category: Category, type: string): ResourceContract | undefined;
}

/**
 * The core-owned catalog of every seeded interface contract. Unlike `Kit`
 * (Section 10, an adapter loaded from a vendored checkout), contracts are
 * "owned centrally, identical across all kits" (Section 6) — there is no
 * per-kit variant to adapt behind this port, so one static, pure catalog is
 * the only implementation needed for now.
 */
export class ContractCatalog implements ContractRegistry {
  private readonly byId = new Map<string, ResourceContract>();

  constructor(contracts: readonly ResourceContract[]) {
    for (const contract of contracts) {
      this.byId.set(contract.id, contract);
    }
  }

  contractFor(category: Category, type: string): ResourceContract | undefined {
    return this.byId.get(`${category}.${type}`);
  }
}
