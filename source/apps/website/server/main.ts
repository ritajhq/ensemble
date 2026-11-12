import { dirname, fromFileUrl, join } from "@std/path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import * as Website from "@ensemble/website";
import { BOTANICALS_WEBP_BASE64 } from "./botanicals.ts";
import { ENSEMBLE_LOGO_PNG_BASE64 } from "./ensemble-logo.ts";
import {
  GEIST_MONO_WOFF2_BASE64,
  GEIST_SANS_WOFF2_BASE64,
  LIBRE_CASLON_TEXT_BOLD_WOFF2_BASE64,
  LIBRE_CASLON_TEXT_REGULAR_WOFF2_BASE64,
} from "./fonts.ts";
import { buildDocsNav, firstPageSlug, readDocsSource } from "./docs/content.ts";
import { renderMarkdown } from "./docs/render.ts";
import { Poller } from "./docs/poller.ts";
import { Repository } from "./docs/repository.ts";
import { Catalog } from "./kits/catalog.ts";

const PAGE_TITLE = "Ensemble — one workspace, one CLI, source to deployment";
const PAGE_DESCRIPTION =
  "Ensemble is a TypeScript project layout and command-line tool that takes an app " +
  "from source through build, packaging, and deployment, without the structure " +
  "decaying as the project grows.";

// Where the docs are published to (see `docs/poller.ts`): the `docs/` folder of
// the ensemble repository. `documentation/` is the published subset; generated
// architecture pages and assets beside it are deliberately not served here.
const DOCS_DIR = Deno.env.get("DOCS_DIR") ?? "/data/docs";
const DOCS_ROOT = join(DOCS_DIR, "documentation");

// The landing page and the docs answer on hosts of their own (ensemble.blue
// and docs.ensemble.blue in production). Unset, both live on whichever host
// asked, as they do when the server runs bare.
const DOCS_HOST = Deno.env.get("DOCS_HOST");
const SITE_HOST = Deno.env.get("SITE_HOST");

new Poller(
  new Repository(
    Deno.env.get("DOCS_REPOSITORY") ?? "ritajhq/ensemble",
    Deno.env.get("DOCS_REF") ?? "main",
    Deno.env.get("DOCS_FOLDER") ?? "docs",
    DOCS_DIR,
  ),
  Number(Deno.env.get("DOCS_POLL_SECONDS") ?? 300) * 1000,
).Start();

// The kits page lists the repository's own `.ensemble/kits`, published the
// same way as the docs: kept on disk at the followed ref, polled for changes.
const KITS_DIR = Deno.env.get("KITS_DIR") ?? "/data/kits";
const kits = new Catalog(KITS_DIR);

new Poller(
  new Repository(
    Deno.env.get("DOCS_REPOSITORY") ?? "ritajhq/ensemble",
    Deno.env.get("DOCS_REF") ?? "main",
    ".ensemble/kits",
    KITS_DIR,
  ),
  Number(Deno.env.get("DOCS_POLL_SECONDS") ?? 300) * 1000,
).Start();

// website/content is the react kit's "ssr" target: a hydration bundle
// (main.js + index.css) with no page of its own — this server owns the page
// and serves that bundle's output as its only static assets.
const contentDir = join(dirname(fromFileUrl(import.meta.url)), "..", "content");

function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const logoBytes = decodeBase64(ENSEMBLE_LOGO_PNG_BASE64);
const geistSansBytes = decodeBase64(GEIST_SANS_WOFF2_BASE64);
const geistMonoBytes = decodeBase64(GEIST_MONO_WOFF2_BASE64);
const libreCaslonRegularBytes = decodeBase64(
  LIBRE_CASLON_TEXT_REGULAR_WOFF2_BASE64,
);
const libreCaslonBoldBytes = decodeBase64(LIBRE_CASLON_TEXT_BOLD_WOFF2_BASE64);

/** the landing garlands pieces, one route per cut-out. */
const BOTANICAL_ASSETS = Object.fromEntries(
  Object.entries(BOTANICALS_WEBP_BASE64).map(([name, base64]) => {
    const bytes = decodeBase64(base64);
    return [
      `/botanicals/${name}.webp`,
      { contentType: "image/webp", body: () => bytes },
    ];
  }),
);

const STATIC_ASSETS: Record<
  string,
  {
    contentType: string;
    body: () => Promise<Uint8Array<ArrayBuffer>> | Uint8Array<ArrayBuffer>;
  }
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
  ...BOTANICAL_ASSETS,
};

interface PageShellOptions {
  title: string;
  description: string;
  body: string;
  /** Whether content/main.tsx hydrates the page. */
  hydrate: boolean;
  /** Props the client hydrates the page with, embedded as JSON. */
  props?: { elementId: string; value: unknown };
}

/** JSON safe inside a <script>: no `<` can close the tag early. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function pageShell(
  { title, description, body, hydrate, props }: PageShellOptions,
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
    ${
    props
      ? `<script type="application/json" id="${props.elementId}">${
        scriptJson(props.value)
      }</script>`
      : ""
  }
    ${hydrate ? '<script type="module" src="/main.js"></script>' : ""}
  </body>
</html>
`;
}

/** The landing page, for every path nothing else answers; content/main.tsx hydrates it. */
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
    return new Response("Docs aren't published on this deployment yet.", {
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

  const props: Website.DocsProps = {
    pathname,
    nav,
    title: rendered.title,
    html: rendered.html,
    toc: rendered.toc,
    homeUrl: SITE_HOST ? `//${SITE_HOST}/` : "/",
  };
  const html = pageShell({
    title: `${rendered.title} — Ensemble Docs`,
    description: PAGE_DESCRIPTION,
    body: renderToString(createElement(Website.Docs, props)),
    hydrate: true,
    props: { elementId: Website.DOCS_PROPS_ELEMENT_ID, value: props },
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

/** `?role=` as one of the roles the page knows, or none. */
const KIT_ROLES: readonly Website.KitRole[] = [
  "build",
  "pack",
  "deploy",
  "ecosystem",
  "lib",
];

async function renderKitsPage(url: URL): Promise<Response> {
  const asked = url.searchParams.get("role") as Website.KitRole | null;
  const role = asked && KIT_ROLES.includes(asked) ? asked : undefined;
  const props: Website.KitsProps = { kits: await kits.List(), role };
  const html = pageShell({
    title: "Kits — Ensemble",
    description:
      "The official Ensemble kits: what builds, packs and deploys your apps.",
    body: renderToString(createElement(Website.Kits, props)),
    hydrate: false,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const KIT_ICON_PATH = /^\/kits\/([^/]+)\/([^/]+)\/icon\.svg$/;

/** A kit's icon. Served with a policy that runs nothing, should one ever carry a script. */
async function serveKitIcon(pathname: string): Promise<Response | undefined> {
  const match = pathname.match(KIT_ICON_PATH);
  if (!match) return undefined;
  const icon = await kits.Icon(match[1], match[2]);
  if (!icon) return new Response("Not found", { status: 404 });
  return new Response(icon, {
    headers: {
      "content-type": "image/svg+xml",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "cache-control": "public, max-age=3600",
    },
  });
}

function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

function isDocsHost(req: Request): boolean {
  if (!DOCS_HOST) return false;
  return req.headers.get("host")?.split(":")[0] === DOCS_HOST;
}

// Scheme-relative, so the browser keeps the scheme it arrived with: behind a
// chain of proxies the server can't tell it reliably.
function redirectToDocsHost(pathname: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location: `//${DOCS_HOST}${pathname}` },
  });
}

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8000) }, async (req) => {
  const { pathname } = new URL(req.url);

  const asset = await serveStaticAsset(pathname);
  if (asset) return asset;

  if (isDocsHost(req)) {
    return await renderDocsPage(isDocsPath(pathname) ? pathname : "/docs");
  }

  if (isDocsPath(pathname)) {
    if (DOCS_HOST) return redirectToDocsHost(pathname);
    return await renderDocsPage(pathname);
  }

  const icon = await serveKitIcon(pathname);
  if (icon) return icon;
  if (pathname.replace(/\/+$/, "") === "/kits") {
    return await renderKitsPage(new URL(req.url));
  }

  return new Response(renderPage(), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
