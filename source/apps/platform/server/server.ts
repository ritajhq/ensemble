import type { Api } from "./api.ts";

/** The built web app's files, each with its type. */
const ASSETS: Readonly<Record<string, string>> = {
  "main.js": "text/javascript; charset=utf-8",
  "index.css": "text/css; charset=utf-8",
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // The UI's primitives (Radix, framer-motion) inject <style> elements at
  // runtime; scripts stay 'self' only.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

/** The built web app (`ens build platform/web`), read once at startup. */
export class WebApp {
  private constructor(
    private readonly index: string,
    private readonly assets: ReadonlyMap<string, string>,
  ) {}

  static async load(dist: string): Promise<WebApp> {
    const assets = new Map<string, string>();
    for (const name of Object.keys(ASSETS)) {
      assets.set(name, await Deno.readTextFile(`${dist}/${name}`));
    }
    return new WebApp(await Deno.readTextFile(`${dist}/index.html`), assets);
  }

  asset(name: string): Response {
    const content = this.assets.get(name);
    if (content === undefined) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(content, {
      headers: { "content-type": ASSETS[name], "cache-control": "no-cache" },
    });
  }

  page(): Response {
    return new Response(this.index, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": CSP,
        "x-frame-options": "DENY",
        "cache-control": "no-store",
      },
    });
  }
}

/**
 * The platform's HTTP surface: `/api/*` is the JSON API, `/assets/<file>`
 * the web app's files, and any other `GET` the web app's page.
 *
 * It has no access control of its own: it must be reached only through the
 * idhn guard in front of it.
 */
export class Server {
  constructor(private readonly api: Api, private readonly web: WebApp) {}

  async handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return await this.api.handle(request);
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (pathname.startsWith("/assets/")) {
      return this.web.asset(pathname.slice("/assets/".length));
    }
    return this.web.page();
  }
}
