import { dirname, fromFileUrl, join } from "@std/path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import * as Website from "@ensemble/website";
import { ENSEMBLE_LOGO_PNG_BASE64 } from "./ensemble-logo.ts";
import {
  GEIST_MONO_WOFF2_BASE64,
  GEIST_SANS_WOFF2_BASE64,
  LIBRE_CASLON_TEXT_BOLD_WOFF2_BASE64,
  LIBRE_CASLON_TEXT_REGULAR_WOFF2_BASE64,
} from "./fonts.ts";
import { buildDocsNav, firstPageSlug, readDocsSource } from "./docs/content.ts";
import { renderMarkdown } from "./docs/render.ts";

const PAGE_TITLE = "Ensemble — one workspace, one CLI, source to deployment";
const PAGE_DESCRIPTION =
  "Ensemble is a TypeScript project layout and command-line tool that takes an app " +
  "from source through build, packaging, and deployment, without the structure " +
  "decaying as the project grows.";

// Where git-sync lands the `docs/` folder it syncs from the ensemble repo (see
// ci/website/delivery.yml's `variables.repos` and the `docs-content` volume
// mount) — `documentation/` is the published subset; `docs/agent` and
// `docs/backlog.md` etc. are internal and deliberately not served here.
const DOCS_ROOT = Deno.env.get("DOCS_DIR") ?? "/data/docs/documentation";

// website/content is the react kit's "ssr" target: a hydration bundle
// (main.js + index.css) with no page of its own — this server owns the page
// and serves that bundle's output as its only static assets.
const contentDir = join(dirname(fromFileUrl(import.meta.url)), "..", "content");

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const logoBytes = decodeBase64(ENSEMBLE_LOGO_PNG_BASE64);
const geistSansBytes = decodeBase64(GEIST_SANS_WOFF2_BASE64);
const geistMonoBytes = decodeBase64(GEIST_MONO_WOFF2_BASE64);
const libreCaslonRegularBytes = decodeBase64(
  LIBRE_CASLON_TEXT_REGULAR_WOFF2_BASE64,
);
const libreCaslonBoldBytes = decodeBase64(LIBRE_CASLON_TEXT_BOLD_WOFF2_BASE64);

const STATIC_ASSETS: Record<
  string,
  { contentType: string; body: () => Promise<Uint8Array> | Uint8Array }
> = {
  "/main.js": {
    contentType: "text/javascript; charset=utf-8",
    body: () => Deno.readFile(join(contentDir, "main.js")),
  },
  "/index.css": {
    contentType: "text/css; charset=utf-8",
    body: () => Deno.readFile(join(contentDir, "index.css")),
  },
  "/ensemble-logo.png": {
    contentType: "image/png",
    body: () => logoBytes,
  },
  "/fonts/geist-sans.woff2": {
    contentType: "font/woff2",
    body: () => geistSansBytes,
  },
  "/fonts/geist-mono.woff2": {
    contentType: "font/woff2",
    body: () => geistMonoBytes,
  },
  "/fonts/libre-caslon-text-regular.woff2": {
    contentType: "font/woff2",
    body: () => libreCaslonRegularBytes,
  },
  "/fonts/libre-caslon-text-bold.woff2": {
    contentType: "font/woff2",
    body: () => libreCaslonBoldBytes,
  },
};

interface PageShellOptions {
  title: string;
  description: string;
  body: string;
  /** Landing is a hydration target for content/main.tsx; docs pages render once, server-side only. */
  hydrate: boolean;
}

function pageShell(
  { title, description, body, hydrate }: PageShellOptions,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <link rel="icon" type="image/png" href="/ensemble-logo.png" />
    <link rel="preload" href="/fonts/geist-sans.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
    <link rel="stylesheet" href="/index.css" />
  </head>
  <body>
    <div id="root">${body}</div>
    ${hydrate ? '<script type="module" src="/main.js"></script>' : ""}
  </body>
</html>
`;
}

function renderPage(): string {
  const body = renderToString(createElement(Website.Landing));
  return pageShell({
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    body,
    hydrate: true,
  });
}

async function renderDocsPage(pathname: string): Promise<Response> {
  const nav = await buildDocsNav(DOCS_ROOT);
  if (!nav) {
    return new Response("Docs aren't synced onto this deployment yet.", {
      status: 503,
    });
  }

  if (pathname === "/docs") {
    const target = firstPageSlug(nav);
    if (!target) return new Response("No docs published yet.", { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { location: `/docs/${target}` },
    });
  }

  const slug = pathname.slice("/docs/".length).replace(/\/+$/, "");
  const found = await readDocsSource(DOCS_ROOT, slug);
  if (!found) return new Response("Not found", { status: 404 });

  let rendered;
  try {
    rendered = await renderMarkdown(found.source, found.dir);
  } catch (error) {
    console.error(`Failed to render docs page "${slug}":`, error);
    return new Response("Failed to render this page.", { status: 500 });
  }

  const body = renderToString(
    createElement(Website.DocsLayout, {
      nav,
      activeSlug: slug,
      html: rendered.html,
      toc: rendered.toc,
    }),
  );
  const html = pageShell({
    title: `${rendered.title} — Ensemble Docs`,
    description: PAGE_DESCRIPTION,
    body,
    hydrate: false,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function serveStaticAsset(
  pathname: string,
): Promise<Response | undefined> {
  const asset = STATIC_ASSETS[pathname];
  if (!asset) return undefined;

  try {
    const body = await asset.body();
    return new Response(body, {
      headers: { "content-type": asset.contentType },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8000) }, async (req) => {
  const { pathname } = new URL(req.url);

  const asset = await serveStaticAsset(pathname);
  if (asset) return asset;

  if (pathname === "/docs" || pathname.startsWith("/docs/")) {
    return await renderDocsPage(pathname);
  }

  return new Response(renderPage(), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
