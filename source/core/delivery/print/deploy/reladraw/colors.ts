import type { Architecture, Id } from "../architecture.ts";
import type { Theme } from "./theme.ts";

/**
 * A color for each compute, so its lines can be told apart and followed from
 * the box they leave to what they reach: a compute's box has its border in the
 * color, and every line it uses others by. Computes beyond the theme's colors
 * share them again in the order they were declared.
 */
export class Colors {
  private readonly indexes: ReadonlyMap<Id, number>;

  constructor(architecture: Architecture, private readonly theme: Theme) {
    this.indexes = new Map(
      architecture.entries
        .filter((entry) => entry.category === "compute")
        .map((entry, index) => [entry.id, index % theme.computeColors]),
    );
  }

  /** The reladraw styles of the theme: its tints, and the compute colors in use. */
  declarations(): string[] {
    return this.theme.styles(
      [...new Set(this.indexes.values())].sort((a, b) => a - b),
    );
  }

  /** The style of a compute's box and lines, none for any other entry. */
  styleOf(id: Id): string | undefined {
    const index = this.indexes.get(id);
    return index === undefined ? undefined : `compute_${index}`;
  }
}
