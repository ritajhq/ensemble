import type { Architecture } from "../architecture.ts";
import { Drawing, type Drawn } from "./drawing.ts";
import { Source } from "./source.ts";
import { Theme } from "./theme.ts";

/** An architecture drawn: the reladraw source it was written as, the SVG, and what reladraw noticed. */
export interface Diagram extends Drawn {
  readonly source: string;
}

/** What reladraw says of a line whose `turn:` it can't place: its ends are level, so the line runs straight. */
const STRAIGHT_LINE = /edge (\S+ -> \S+): `turn:/;

/**
 * Writes an architecture as reladraw source and draws it. Whether a line runs
 * straight is only known once reladraw has laid the drawing out, and it
 * refuses a turn on one that does, so such a line is written again without
 * its turn until the drawing holds together.
 */
export class Diagrammer {
  constructor(
    private readonly source: Source = new Source(),
    private readonly drawing: Drawing = new Drawing(),
  ) {}

  draw(architecture: Architecture, theme: Theme = Theme.dark): Diagram {
    const straight = new Set<string>();
    for (;;) {
      const source = this.source.write(architecture, straight, theme);
      try {
        return { source, ...this.drawing.draw(source) };
      } catch (error) {
        const line = STRAIGHT_LINE.exec(String(error))?.[1];
        if (!line || straight.has(line)) throw error;
        straight.add(line);
      }
    }
  }
}
