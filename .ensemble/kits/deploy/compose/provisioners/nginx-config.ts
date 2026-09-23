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
 * A route's `path` normalized to nginx's own `location <prefix> { ... }`
 * shape: a plain string path is a passthrough prefix (nginx forwards the
 * original request URI unchanged, since `proxy_pass` gets no URI of its own
 * — `/uploads/*` stays `/uploads/*` all the way to the target, matching
 * `strip` being unset/false); `{ match, strip: true }` instead gives both
 * `location` and `proxy_pass` a trailing slash, nginx's own idiom for
 * stripping the matched prefix before forwarding (`/api/*` → `/*` at the
 * target). A trailing `*` is the manifest's own glob-suffix convention, not
 * meaningful to nginx (a literal `*` inside a normal prefix location would
 * only match that literal character), so it's dropped here rather than
 * emitted — nginx's own unmodified prefix location already matches
 * "starts with", the same intent the `*` suffix signals in the manifest.
 */
function normalizePath(
  path: string | RoutePath,
): { prefix: string; strip: boolean } {
  const raw = typeof path === "string" ? path : path.match;
  const strip = typeof path === "string" ? false : path.strip ?? false;
  const withoutGlob = raw.endsWith("*") ? raw.slice(0, -1) : raw;
  const prefix = strip && !withoutGlob.endsWith("/")
    ? `${withoutGlob}/`
    : withoutGlob;
  return { prefix: prefix || "/", strip };
}

function locationBlock(route: Route): string {
  const { prefix, strip } = normalizePath(route.path);
  const upstream = `http://${route.target.service}:${route.target.port}`;
  const proxyPass = strip ? `${upstream}/` : upstream;
  return `    location ${prefix} {\n      proxy_pass ${proxyPass};\n    }`;
}

/**
 * Groups routes by `host` (first-seen order, same "declaration order, not
 * alphabetical" convention `assembleComposeDocument` already follows for
 * services) into one nginx `server {}` block per host — nginx itself doesn't
 * need this grouping (a `server_name` could repeat across blocks), but one
 * block per host keeps the generated file readable and matches how a
 * manifest author already thinks about their own routes.
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
 * The full `nginx.conf` for a `gateway.v1` resource on compose: one `http {}`
 * block, one `server {}` per distinct route host, listening on plain HTTP
 * only — `tls` isn't rendered here at all (the contract's own comment
 * explains why: not yet implemented, nobody has asked for the cert pipeline
 * this would need). `events {}` is required by nginx's own config grammar
 * even though this gateway has nothing to tune there.
 */
export function nginxConf(routes: readonly Route[]): string {
  const servers = [...groupByHost(routes).entries()].map(
    ([host, hostRoutes]) => {
      const locations = hostRoutes.map(locationBlock).join("\n\n");
      return `  server {\n    listen 80;\n    server_name ${host};\n\n${locations}\n  }`;
    },
  ).join("\n\n");

  return `events {}\n\nhttp {\n${servers}\n}\n`;
}
