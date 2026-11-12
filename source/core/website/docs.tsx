import { DocsLayout } from "fumadocs/layouts/docs";
import {
  DocsBody,
  DocsPage as Page,
  DocsTitle,
} from "fumadocs/layouts/docs/page";
import { RootProvider } from "fumadocs/provider";
import { StaticFramework } from "fumadocs/adapters/static";
import type * as PageTree from "fumadocs/page-tree";
import { Logo } from "./Logo.tsx";
import { GITHUB_URL } from "./constants.ts";
import type { DocsNode, TocEntry } from "./docs-types.ts";

/** Everything a docs page renders from — sent to the client as-is to hydrate. */
export interface DocsProps {
  /** The page's path, as the server saw it; the sidebar marks it active. */
  pathname: string;
  nav: DocsNode[];
  title: string;
  /** The page body, already rendered from markdown by the server. */
  html: string;
  toc: TocEntry[];
  /** Where the landing page lives, for the logo link. */
  homeUrl: string;
}

/** The id of the script tag that carries a docs page's props to the client. */
export const PROPS_ELEMENT_ID = "docs-props";

function pageUrl(slug: string): string {
  return `/docs/${slug}`;
}

/** Sections the sidebar starts collapsed; they still open on their own pages. */
const COLLAPSED_SECTIONS = new Set(["Reference"]);

/** Our nav tree, as Fumadocs' page tree: pages become items, sections folders. */
function toPageTree(nav: DocsNode[]): PageTree.Root {
  const convert = (node: DocsNode): PageTree.Node => {
    if (node.kind === "page") {
      return { type: "page", name: node.title, url: pageUrl(node.slug) };
    }
    return {
      type: "folder",
      name: node.title,
      defaultOpen: !COLLAPSED_SECTIONS.has(node.title),
      index: node.slug === undefined
        ? undefined
        : { type: "page", name: node.title, url: pageUrl(node.slug) },
      children: node.children.map(convert),
    };
  };
  return { name: "Ensemble", children: nav.map(convert) };
}

function NavTitle() {
  return (
    <span className="inline-flex items-center gap-2 font-serif text-lg">
      <Logo className="h-6 w-6" />
      Ensemble
    </span>
  );
}

/** A docs page in the site theme: Fumadocs' layout around our rendered markdown. */
export function Docs({ pathname, nav, title, html, toc, homeUrl }: DocsProps) {
  return (
    <RootProvider theme={{ defaultTheme: "light" }}>
      <StaticFramework pathname={pathname}>
        <DocsLayout
          tree={toPageTree(nav)}
          nav={{ title: <NavTitle />, url: homeUrl }}
          githubUrl={GITHUB_URL}
        >
          <Page
            toc={toc.map((entry) => ({
              title: entry.text,
              url: `#${entry.slug}`,
              depth: entry.depth,
            }))}
          >
            <DocsTitle className="font-serif font-normal">{title}</DocsTitle>
            <DocsBody>
              <div
                className="docs-prose"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </DocsBody>
          </Page>
        </DocsLayout>
      </StaticFramework>
    </RootProvider>
  );
}
