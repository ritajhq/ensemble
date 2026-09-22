import { Container } from "./Container.tsx";
import { Logo } from "./Logo.tsx";
import { GitHubMarkIcon } from "./Icon.tsx";
import { GITHUB_URL } from "./constants.ts";
import type { DocsNode, TocEntry } from "./docs-types.ts";

interface DocsLayoutProps {
  nav: DocsNode[];
  activeSlug: string;
  html: string;
  toc: TocEntry[];
}

export function DocsLayout({ nav, activeSlug, html, toc }: DocsLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <DocsHeader />
      <Container className="flex max-w-7xl gap-10 py-10">
        <DocsSidebar nav={nav} activeSlug={activeSlug} />
        <main className="min-w-0 flex-1">
          <div
            className="docs-prose"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </main>
        {toc.length > 0 && <DocsToc toc={toc} />}
      </Container>
    </div>
  );
}

function DocsHeader() {
  return (
    <header className="border-b border-slate-100">
      <Container className="flex max-w-7xl items-center justify-between py-4">
        <a href="/" className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="font-medium text-slate-900">Ensemble</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">Docs</span>
        </a>
        <a
          href={GITHUB_URL}
          className="text-slate-400 transition hover:text-slate-600"
          aria-label="Ensemble on GitHub"
        >
          <GitHubMarkIcon className="h-5 w-5" />
        </a>
      </Container>
    </header>
  );
}

function DocsSidebar(
  { nav, activeSlug }: { nav: DocsNode[]; activeSlug: string },
) {
  return (
    <nav className="hidden w-56 shrink-0 lg:block">
      <ul className="sticky top-10 space-y-6 text-sm">
        {nav.map((node) => (
          <DocsNavEntry
            key={navKey(node)}
            node={node}
            activeSlug={activeSlug}
          />
        ))}
      </ul>
    </nav>
  );
}

function DocsNavEntry(
  { node, activeSlug }: { node: DocsNode; activeSlug: string },
) {
  if (node.kind === "page") {
    return (
      <li>
        <a
          href={`/docs/${node.slug}`}
          className={navLinkClass(node.slug, activeSlug)}
        >
          {node.title}
        </a>
      </li>
    );
  }

  return (
    <li>
      <div className="mb-2 font-medium text-slate-900">
        {node.slug
          ? (
            <a
              href={`/docs/${node.slug}`}
              className={navLinkClass(node.slug, activeSlug)}
            >
              {node.title}
            </a>
          )
          : node.title}
      </div>
      <ul className="space-y-1.5 border-l border-slate-100 pl-3">
        {node.children.map((child) => (
          <DocsNavEntry
            key={navKey(child)}
            node={child}
            activeSlug={activeSlug}
          />
        ))}
      </ul>
    </li>
  );
}

function DocsToc({ toc }: { toc: TocEntry[] }) {
  return (
    <nav className="hidden w-48 shrink-0 xl:block">
      <div className="sticky top-10 text-sm">
        <div className="mb-2 font-medium text-slate-900">On this page</div>
        <ul className="space-y-1.5 text-slate-500">
          {toc.map((entry) => (
            <li
              key={entry.slug}
              className={entry.depth === 3 ? "pl-3" : undefined}
            >
              <a
                href={`#${entry.slug}`}
                className="transition hover:text-blue-600"
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function navLinkClass(slug: string, activeSlug: string): string {
  return slug === activeSlug
    ? "text-blue-600 font-medium"
    : "text-slate-600 transition hover:text-slate-900";
}

function navKey(node: DocsNode): string {
  return node.kind === "page" ? node.slug : (node.slug ?? node.title);
}
