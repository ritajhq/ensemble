import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import { toString as hastToString } from "hast-util-to-string";
import type { Heading, Link, Root as MdastRoot } from "mdast";
import type { Element, Root as HastRoot } from "hast";
import type { TocEntry } from "@ensemble/website";

export interface RenderedDoc {
  title: string;
  html: string;
  toc: TocEntry[];
}

/** Resolves a relative `.md` link (as written for reading the file on GitHub) against the
 * linking page's own directory, into a `/docs/<slug>` route — e.g. from `getting-started/`,
 * `../concepts/kits.md` becomes `/docs/concepts/kits`. */
function resolveDocLink(currentDir: string, relativePath: string): string {
  const stack = currentDir ? currentDir.split("/") : [];
  for (const part of relativePath.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  const resolved = stack.join("/").replace(/\.md$/, "");
  const withoutIndex = resolved.endsWith("/index")
    ? resolved.slice(0, -"/index".length)
    : resolved;
  return `/docs/${withoutIndex === "index" ? "" : withoutIndex}`;
}

function remarkRewriteDocLinks(currentDir: string) {
  return (tree: MdastRoot) => {
    visit(tree, "link", (node: Link) => {
      const [path, hash] = node.url.split("#");
      if (
        !path.endsWith(".md") || /^[a-z][a-z0-9+.-]*:/i.test(path) ||
        path.startsWith("/")
      ) return;
      node.url = resolveDocLink(currentDir, path) + (hash ? `#${hash}` : "");
    });
  };
}

/** Renders one doc's markdown source into HTML, its `h1` title, and its `h2`/`h3` TOC. */
export async function renderMarkdown(
  source: string,
  currentDir: string,
): Promise<RenderedDoc> {
  let title: string | undefined;
  const toc: TocEntry[] = [];

  function remarkExtractTitle() {
    return (tree: MdastRoot) => {
      const heading = tree.children.find((n): n is Heading =>
        n.type === "heading" && n.depth === 1
      );
      if (heading) title = mdastToString(heading);
    };
  }

  function rehypeExtractToc() {
    return (tree: HastRoot) => {
      visit(tree, "element", (node: Element) => {
        if (node.tagName !== "h2" && node.tagName !== "h3") return;
        const id = node.properties?.id;
        if (typeof id !== "string") return;
        toc.push({
          depth: node.tagName === "h2" ? 2 : 3,
          text: hastToString(node),
          slug: id,
        });
      });
    };
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkExtractTitle)
    .use(remarkRewriteDocLinks, currentDir)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeExtractToc)
    .use(rehypeShiki, { theme: "vitesse-light" })
    .use(rehypeStringify)
    .process(source);

  return { title: title ?? "Documentation", html: String(file), toc };
}
