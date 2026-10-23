import { basename, dirname, extname, join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { Architecture } from "../architecture.ts";
import { Diagrammer } from "../reladraw/diagram.ts";
import { Theme } from "../reladraw/theme.ts";
import { Page } from "./page.ts";

/** What writing an architecture's files left behind. */
export interface Written {
  readonly page: string;
  /** The drawing for a dark page and for a light one. */
  readonly drawing: string;
  readonly lightDrawing: string;
  /** The reladraw source of the dark drawing; the light one differs in colors only. */
  readonly source: string;
  /** What reladraw noticed about how the drawing reads (a line crossing a box, say). */
  readonly findings: readonly string[];
}

/**
 * Writes an architecture as four files that share a name: the Markdown
 * page, the drawing it shows for a dark page (`.svg`) and for a light one
 * (`-light.svg`), and the reladraw source of the dark one (`.reladraw`),
 * creating the page's folder if it isn't there.
 */
export class Files {
  constructor(
    private readonly diagrammer: Diagrammer = new Diagrammer(),
    private readonly page: Page = new Page(),
  ) {}

  async write(
    name: string,
    pagePath: string,
    architecture: Architecture,
  ): Promise<Written> {
    const stem = basename(pagePath, extname(pagePath));
    const sibling = (extension: string) =>
      join(dirname(pagePath), stem + extension);

    const diagram = this.diagrammer.draw(architecture, Theme.dark);
    const light = this.diagrammer.draw(architecture, Theme.light);

    await ensureDir(dirname(pagePath));
    await Deno.writeTextFile(sibling(".reladraw"), diagram.source);
    await Deno.writeTextFile(sibling(".svg"), diagram.svg);
    await Deno.writeTextFile(sibling(`${Theme.light.suffix}.svg`), light.svg);
    await Deno.writeTextFile(
      pagePath,
      this.page.write(name, stem, architecture),
    );
    return {
      page: pagePath,
      drawing: sibling(".svg"),
      lightDrawing: sibling(`${Theme.light.suffix}.svg`),
      source: sibling(".reladraw"),
      findings: diagram.findings,
    };
  }
}
