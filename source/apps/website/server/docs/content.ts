import { exists } from "@std/fs";
import type { DocsNode, DocsPage } from "@ensemble/website";

// Top-level folders in a preferred reading order; anything else (and every
// nested folder) falls back to alphabetical.
const SECTION_ORDER = ["getting-started", "concepts", "guides", "reference"];

function sectionRank(name: string): number {
  const index = SECTION_ORDER.indexOf(name);
  return index === -1 ? SECTION_ORDER.length : index;
}

function humanize(segment: string): string {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractTitle(source: string): string | undefined {
  for (const line of source.split("\n")) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    // Nav labels are plain text — strip inline code spans (`ens app` -> ens app)
    // rather than pulling in a full markdown parse just for a heading's title.
    if (match) return match[1].replace(/`([^`]+)`/g, "$1");
  }
  return undefined;
}

interface BuiltChildren {
  nodes: DocsNode[];
  indexPage?: DocsPage;
}

async function buildChildren(
  dir: string,
  slugPrefix: string,
): Promise<BuiltChildren> {
  const entries: Deno.DirEntry[] = [];
  for await (const entry of Deno.readDir(dir)) entries.push(entry);

  const dirEntries = entries
    .filter((e) => e.isDirectory)
    .sort((a, b) =>
      sectionRank(a.name) - sectionRank(b.name) || a.name.localeCompare(b.name)
    );
  const fileEntries = entries
    .filter((e) => e.isFile && e.name.endsWith(".md"))
    .sort((a, b) => a.name.localeCompare(b.name));

  let indexPage: DocsPage | undefined;
  const pages: DocsPage[] = [];
  for (const file of fileEntries) {
    const base = file.name.slice(0, -".md".length);
    const slug = base === "index"
      ? slugPrefix
      : (slugPrefix ? `${slugPrefix}/${base}` : base);
    const source = await Deno.readTextFile(`${dir}/${file.name}`);
    const page: DocsPage = {
      kind: "page",
      slug,
      title: extractTitle(source) ?? humanize(base),
    };
    if (base === "index") indexPage = page;
    else pages.push(page);
  }

  const sections: DocsNode[] = [];
  for (const dirEntry of dirEntries) {
    const childSlugPrefix = slugPrefix
      ? `${slugPrefix}/${dirEntry.name}`
      : dirEntry.name;
    const built = await buildChildren(
      `${dir}/${dirEntry.name}`,
      childSlugPrefix,
    );
    sections.push({
      kind: "section",
      title: built.indexPage?.title ?? humanize(dirEntry.name),
      slug: built.indexPage?.slug,
      children: built.nodes,
    });
  }

  return { nodes: [...pages, ...sections], indexPage };
}

/** Walks `rootDir` into a nav tree, or `undefined` if it doesn't exist (docs not synced yet). */
export async function buildDocsNav(
  rootDir: string,
): Promise<DocsNode[] | undefined> {
  if (!await exists(rootDir, { isDirectory: true })) return undefined;
  return (await buildChildren(rootDir, "")).nodes;
}

/** The first page in reading order — where a bare `/docs` request redirects to. */
export function firstPageSlug(nav: DocsNode[]): string | undefined {
  for (const node of nav) {
    if (node.kind === "page") return node.slug;
    if (node.slug) return node.slug;
    const nested = firstPageSlug(node.children);
    if (nested) return nested;
  }
  return undefined;
}

export interface DocsSource {
  source: string;
  /** The slug's own directory — relative `.md` links in the source resolve against this. */
  dir: string;
}

/** Reads `<rootDir>/<slug>.md`, falling back to `<rootDir>/<slug>/index.md`. */
export async function readDocsSource(
  rootDir: string,
  slug: string,
): Promise<DocsSource | undefined> {
  const dir = slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "";
  try {
    return { source: await Deno.readTextFile(`${rootDir}/${slug}.md`), dir };
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  try {
    return {
      source: await Deno.readTextFile(`${rootDir}/${slug}/index.md`),
      dir: slug,
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}
