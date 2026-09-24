/** A single doc page: a rendered `.md` file, addressable at `/docs/<slug>`. */
export interface DocsPage {
  kind: "page";
  slug: string;
  title: string;
}

/** A folder in the docs tree. `slug` is set when the folder has its own `index.md`. */
export interface DocsSection {
  kind: "section";
  title: string;
  slug?: string;
  children: DocsNode[];
}

export type DocsNode = DocsPage | DocsSection;

/** One heading (`h2`/`h3`) pulled out of a rendered page, for the "on this page" rail. */
export interface TocEntry {
  depth: 2 | 3;
  text: string;
  slug: string;
}
