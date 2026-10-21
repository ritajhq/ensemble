import type { Category } from "../workload.ts";

/** The engines a kit provides for one type: what a developer may pin, and the one a type gets when nobody pins. */
export interface EngineSet {
  readonly provides: readonly string[];
  readonly default: string;
}

/** A kit's engines by contract, `category.type` — `{ "databases.key-value": { provides: ["dynamodb"], default: "dynamodb" } }`. */
export type EngineTable = Readonly<Record<string, EngineSet>>;

/**
 * What a kit's realization needs to answer for engines (`Realization.enginesFor`
 * and the `engine` default), from one table — so a kit states which
 * technologies it provides in one place, and a platform changing the default
 * does so through the kit's own config rather than the kit's code.
 */
export class Engines {
  constructor(private readonly table: EngineTable) {}

  provides(category: Category, type: string): readonly string[] | undefined {
    return this.table[`${category}.${type}`]?.provides;
  }

  /** The kit's default engine for a type, when `concern` is `engine`; `undefined` for any other concern or a type the table doesn't cover. */
  defaultFor(
    category: Category,
    type: string,
    concern: string,
  ): string | undefined {
    return concern === "engine"
      ? this.table[`${category}.${type}`]?.default
      : undefined;
  }
}
