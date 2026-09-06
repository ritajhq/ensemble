import { dirname, fromFileUrl, join } from "@std/path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Landing } from "../shared/index.ts";

const PAGE_TITLE = "Ensemble — one workspace, one CLI, source to deployment";
const PAGE_DESCRIPTION =
  "Ensemble is a TypeScript project layout and command-line tool that takes an app " +
  "from source through build, packaging, and deployment, without the structure " +
  "decaying as the project grows.";

// website/content is the react kit's "ssr" target: a hydration bundle
// (main.js + index.css) with no page of its own — this server owns the page
// and serves that bundle's output as its only static assets.
const contentDir = join(dirname(fromFileUrl(import.meta.url)), "..", "content");

const STATIC_ASSETS: Record<string, { file: string; contentType: string }> = {
  "/main.js": { file: "main.js", contentType: "text/javascript; charset=utf-8" },
  "/index.css": { file: "index.css", contentType: "text/css; charset=utf-8" },
};

function renderPage(): string {
  const body = renderToString(createElement(Landing));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${PAGE_TITLE}</title>
    <meta name="description" content="${PAGE_DESCRIPTION}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${PAGE_TITLE}" />
    <meta property="og:description" content="${PAGE_DESCRIPTION}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${PAGE_TITLE}" />
    <meta name="twitter:description" content="${PAGE_DESCRIPTION}" />
    <link rel="stylesheet" href="/index.css" />
  </head>
  <body>
    <div id="root">${body}</div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
`;
}

async function serveStaticAsset(pathname: string): Promise<Response | undefined> {
  const asset = STATIC_ASSETS[pathname];
  if (!asset) return undefined;

  try {
    const body = await Deno.readFile(join(contentDir, asset.file));
    return new Response(body, { headers: { "content-type": asset.contentType } });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return new Response("Not found", { status: 404 });
    throw error;
  }
}

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8000) }, async (req) => {
  const { pathname } = new URL(req.url);

  const asset = await serveStaticAsset(pathname);
  if (asset) return asset;

  return new Response(renderPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
});
