import type { Endpoints } from "./endpoints.ts";

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
  // The web app's fonts are inlined in its stylesheet as data URIs.
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  // Setting up the GitHub App posts its manifest to GitHub, which creates it.
  "form-action 'self' https://github.com",
].join("; ");

/**
 * The built web app (`ens build platform/web`), read from `dist` on every
 * request: `ens develop` syncs a rebuild into the running container without
 * restarting the server (a restart would end the runs it carries), so a copy
 * kept from startup would go stale.
 */
export class WebApp {
  constructor(private readonly dist: string) {}

  async asset(name: string): Promise<Response> {
    if (!Object.hasOwn(ASSETS, name)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(await this.read(name), {
      headers: { "content-type": ASSETS[name], "cache-control": "no-cache" },
    });
  }

  async page(): Promise<Response> {
    return new Response(await this.read("index.html"), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": CSP,
        "x-frame-options": "DENY",
        "cache-control": "no-store",
      },
    });
  }

  private async read(name: string): Promise<string> {
    return await Deno.readTextFile(`${this.dist}/${name}`);
  }
}

/** Where the platform's own endpoints live: its JSON API, and the webhooks it is sent. */
const ENDPOINT_PREFIXES = ["/api/", "/hooks/"];

/**
 * The platform's HTTP surface: `/api/*` is the JSON API and `/hooks/*` the
 * webhooks (both `Endpoints`), `/assets/<file>` the web app's files, and any
 * other `GET` the web app's page.
 *
 * It has no access control of its own: it must be reached only through the
 * idhn guard in front of it — but for `/hooks/*`, which verify their own
 * senders.
 */
export class Server {
  constructor(
    private readonly endpoints: Endpoints,
    private readonly web: WebApp,
  ) {}

  async handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (ENDPOINT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return await this.endpoints.answer(request);
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (pathname.startsWith("/assets/")) {
      return await this.web.asset(pathname.slice("/assets/".length));
    }
    return await this.web.page();
  }
}
