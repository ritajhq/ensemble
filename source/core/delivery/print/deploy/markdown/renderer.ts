import { join } from "@std/path";
import type { Architecture } from "../architecture.ts";
import type { Renderer as DeployRenderer, Rendering } from "../renderer.ts";
import { Files, type Written } from "./files.ts";

/** The architecture drawn with reladraw: a Markdown page, the drawing it shows (for a dark page and for a light one) and the dark drawing's source, written beside each other. */
export class Renderer implements DeployRenderer {
  /** Where the page of the manifest `name` goes unless told otherwise. */
  static pageIn(repoRoot: string, name: string): string {
    return join(repoRoot, "docs", name, "architecture.md");
  }

  constructor(
    private readonly page: string,
    private readonly files: Files = new Files(),
  ) {}

  async render(name: string, architecture: Architecture): Promise<Rendering> {
    const written = await this.files.write(name, this.page, architecture);
    return {
      written: [
        written.page,
        written.drawing,
        written.lightDrawing,
        written.source,
      ],
      warnings: this.warningsAbout(written),
    };
  }

  /** The findings as one line: there can be dozens, and each is about a line crossing a box. */
  private warningsAbout(written: Written): string[] {
    if (written.findings.length === 0) return [];
    return [
      `reladraw found ${written.findings.length} thing(s) about how the drawing reads (a line crossing a box, say): \`reladraw check ${written.source}\` lists them.`,
    ];
  }
}
