import type { Architecture, Id, Relation } from "../architecture.ts";

/** The category whose entries talk to each other. */
const COMPUTE = "compute";

/**
 * How far down the calls between computes each one sits, so the drawing can
 * put the ones that call above the ones they call and an arrow reads as a
 * step down. A compute nothing calls is at depth 0; any other is one below
 * the deepest compute that calls it. Two computes that call each other are
 * peers: neither counts as the other's caller, and the arrow between them runs
 * across.
 */
export class Flow {
  private readonly depths = new Map<Id, number>();

  constructor(architecture: Architecture) {
    const computes = architecture.entries
      .filter((entry) => entry.category === COMPUTE)
      .map((entry) => entry.id);
    const calls = this.callsBetween(architecture.relations, computes);
    for (const id of computes) this.depths.set(id, 0);
    // Longest paths settle in as many passes as there are computes; a cycle longer than a pair would never settle, so the passes are capped.
    for (let pass = 0; pass < computes.length; pass++) {
      if (!this.deepen(calls)) break;
    }
  }

  depthOf(id: Id): number {
    return this.depths.get(id) ?? 0;
  }

  get deepest(): number {
    return Math.max(0, ...this.depths.values());
  }

  /** The calls from one compute to another, leaving out those whose target calls back. */
  private callsBetween(
    relations: readonly Relation[],
    computes: readonly Id[],
  ): Relation[] {
    const between = relations.filter((relation) =>
      computes.includes(relation.from) && computes.includes(relation.to) &&
      relation.from !== relation.to
    );
    return between.filter((call) =>
      !between.some((other) => other.from === call.to && other.to === call.from)
    );
  }

  /** Moves each called compute below its callers; whether any moved. */
  private deepen(calls: readonly Relation[]): boolean {
    let moved = false;
    for (const call of calls) {
      const below = this.depthOf(call.from) + 1;
      if (below <= this.depthOf(call.to)) continue;
      this.depths.set(call.to, below);
      moved = true;
    }
    return moved;
  }
}
