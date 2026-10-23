import { draw } from "reladraw";

/** What drawing a diagram came to: the SVG, and what reladraw noticed about how it reads. */
export interface Drawn {
  readonly svg: string;
  readonly findings: readonly string[];
}

/** Draws reladraw source to SVG. A finding never stops the drawing; an error in the source does. */
export class Drawing {
  draw(source: string): Drawn {
    const drawn = draw(source);
    return {
      svg: drawn.svg,
      findings: drawn.findings.map((finding) =>
        finding.format("architecture.reladraw")
      ),
    };
  }
}
