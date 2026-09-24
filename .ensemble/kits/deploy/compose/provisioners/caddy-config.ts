interface RouteTarget {
  readonly service: string;
  readonly port: number;
}

interface RoutePath {
  readonly match: string;
  readonly strip?: boolean;
}

interface Route {
  readonly host: string;
  readonly path: string | RoutePath;
  readonly target: RouteTarget;
}

/**
 * A route's `path` as Caddy's own directive + matcher pair. A plain string
 * path is a passthrough prefix — `handle`, which hands the upstream the
 * request URI unchanged (`/uploads/*` stays `/uploads/*`); `{ match, strip:
 * true }` is `handle_path`, Caddy's own idiom for stripping the matched
 * prefix first (`/api/*` → `/*` at the target). Nothing is rewritten in
 * either case: a trailing `*` is Caddy's own path-matcher wildcard, so a
 * manifest's glob suffix is already Caddy syntax — unlike nginx's prefix
 * locations, which needed it dropped to mean "starts with".
 */
function directiveFor(route: Route): { directive: string; match: string } {
  const path = route.path;
  if (typeof path === "string") return { directive: "handle", match: path };
  return {
    directive: path.strip ? "handle_path" : "handle",
    match: path.match,
  };
}

function routeBlock(route: Route): string {
  const { directive, match } = directiveFor(route);
  const upstream = `http://${route.target.service}:${route.target.port}`;
  return `\t${directive} ${match} {\n\t\treverse_proxy ${upstream}\n\t}`;
}

/**
 * Groups routes by `host` (first-seen order, the same "declaration order, not
 * alphabetical" convention `assembleComposeDocument` follows for services)
 * into one Caddy site block per host — Caddy doesn't require the grouping (a
 * host could repeat across blocks), but one block per host keeps the
 * generated file readable and matches how a manifest author already thinks
 * about their own routes.
 */
function groupByHost(routes: readonly Route[]): Map<string, Route[]> {
  const groups = new Map<string, Route[]>();
  for (const route of routes) {
    const group = groups.get(route.host);
    if (group) {
      group.push(route);
    } else {
      groups.set(route.host, [route]);
    }
  }
  return groups;
}

/**
 * A site block's own address. With TLS on it's a bare host: Caddy then serves
 * HTTPS for it, minting certs from its own local CA for `internal` (the
 * `tls internal` directive injected per block below — without it Caddy would
 * attempt a real certificate over ACME for a `.localhost` name and fail).
 * Without TLS it's `http://<host>` explicitly, so Caddy never attempts
 * automatic HTTPS at all. A route with no host falls back to the `:80`
 * catch-all.
 */
function siteAddress(host: string, tls: string | undefined): string {
  if (!host) return ":80";
  return tls ? host : `http://${host}`;
}

/**
 * The full `Caddyfile` for a `gateway.v1` resource on compose: one site block
 * per distinct route host, in declaration order. `tls: internal` renders
 * `tls internal` into every site block — that one line is the entire reason
 * this kit's gateway is Caddy rather than something leaner (see `gateway.ts`).
 */
export function caddyfile(
  routes: readonly Route[],
  tls: string | undefined,
): string {
  const blocks = [...groupByHost(routes).entries()].map(
    ([host, hostRoutes]) => {
      const body = [
        ...(tls === "internal" ? ["\ttls internal"] : []),
        ...hostRoutes.map(routeBlock),
      ];
      return `${siteAddress(host, tls)} {\n${body.join("\n")}\n}`;
    },
  );
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}
