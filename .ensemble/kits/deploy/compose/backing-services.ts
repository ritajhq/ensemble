import type * as KitSdk from "@ensemble/kit-sdk";
import type { ComposeDocument, ComposeService } from "./compose-document.ts";

/** Default dev-container images per database engine — overridable via `engine`, e.g. `engine: mysql` picks a different image than the kind's own default. */
const RELATIONAL_IMAGES: Record<string, string> = {
  postgres: "postgres:16",
  mysql: "mysql:8",
  mariadb: "mariadb:11",
};
const DOCUMENT_IMAGES: Record<string, string> = {
  mongo: "mongo:7",
  mongodb: "mongo:7",
};

const DEFAULT_CACHE_IMAGE = "valkey/valkey:8";
const DEFAULT_OBJECT_STORAGE_IMAGE = "chrislusf/seaweedfs:latest";
const DEFAULT_MESSAGING_IMAGE = "nats:2-alpine";
const DEFAULT_CADDY_IMAGE = "caddy:alpine";

function relationalService(
  name: string,
  spec: KitSdk.Deploy.Relational,
): { service: ComposeService; connectionString: string } {
  const image = spec.engine
    ? (RELATIONAL_IMAGES[spec.engine] ?? spec.engine)
    : RELATIONAL_IMAGES.postgres;
  const isMysql = image.startsWith("mysql") || image.startsWith("mariadb");
  const service: ComposeService = {
    image,
    environment: isMysql
      ? { MYSQL_ROOT_PASSWORD: "ensemble", MYSQL_DATABASE: name }
      : {
        POSTGRES_USER: "ensemble",
        POSTGRES_PASSWORD: "ensemble",
        POSTGRES_DB: name,
      },
  };
  const connectionString = isMysql
    ? `mysql://root:ensemble@${name}:3306/${name}`
    : `postgres://ensemble:ensemble@${name}:5432/${name}`;
  return { service, connectionString };
}

function documentService(
  name: string,
  spec: KitSdk.Deploy.Document,
): { service: ComposeService; connectionString: string } {
  const image = spec.engine
    ? (DOCUMENT_IMAGES[spec.engine] ?? spec.engine)
    : DOCUMENT_IMAGES.mongo;
  return {
    service: {
      image,
      environment: {
        MONGO_INITDB_ROOT_USERNAME: "ensemble",
        MONGO_INITDB_ROOT_PASSWORD: "ensemble",
      },
    },
    connectionString: `mongodb://ensemble:ensemble@${name}:27017`,
  };
}

function cacheOrKeyValueService(
  name: string,
): { service: ComposeService; connectionString: string } {
  return {
    service: { image: DEFAULT_CACHE_IMAGE },
    connectionString: `redis://${name}:6379`,
  };
}

/** Translates one `databases` entry into its Compose service plus the `connectionString` output other entries reference. */
export function translateDatabase(
  name: string,
  spec: KitSdk.Deploy.Database,
): { service: ComposeService; output: Record<string, string> } {
  switch (spec.type) {
    case "relational": {
      const { service, connectionString } = relationalService(name, spec);
      return { service, output: { connectionString } };
    }
    case "document": {
      const { service, connectionString } = documentService(name, spec);
      return { service, output: { connectionString } };
    }
    case "cache":
    case "key-value": {
      const { service, connectionString } = cacheOrKeyValueService(name);
      return { service, output: { connectionString } };
    }
  }
}

/** Translates one `storage` entry. `file-storage` produces no service (it's a named volume — see main.ts's volume wiring) and no referenceable output (consumed via `compute.mounts`, not `${...}`); `object-storage` runs a SeaweedFS-backed service and exposes a `url`. */
export function translateStorage(
  name: string,
  spec: KitSdk.Deploy.Storage,
): { service?: ComposeService; output: Record<string, string> } {
  if (spec.type === "file-storage") {
    return { output: {} };
  }
  return {
    service: {
      image: DEFAULT_OBJECT_STORAGE_IMAGE,
      command: ["server", "-dir=/data", "-s3"],
    },
    output: { url: `http://${name}:8333` },
  };
}

/** Translates one `messaging` entry (queue or pub-sub) onto a shared-shape NATS service — NATS natively covers both core pub/sub and JetStream-backed durable queues from one image. */
export function translateMessaging(
  name: string,
  _spec: KitSdk.Deploy.Messaging,
): { service: ComposeService; output: Record<string, string> } {
  return {
    service: { image: DEFAULT_MESSAGING_IMAGE },
    output: { url: `nats://${name}:4222` },
  };
}

/** A gateway route whose target reference has already been resolved to a concrete address (or undefined if it didn't resolve). */
interface ResolvedGatewayRoute {
  host?: string;
  match: string;
  target: string | undefined;
  strip?: boolean;
}

/** One Caddy routing directive: `handle_path` strips the matched prefix before proxying, `handle` forwards it intact — Caddy's own two forms for exactly the `strip` distinction. */
function gatewayRouteBlock(route: ResolvedGatewayRoute): string {
  const directive = route.strip ? "handle_path" : "handle";
  const body = route.target ? `reverse_proxy ${route.target}` : "respond 502";
  return `\t${directive} ${route.match} {\n\t\t${body}\n\t}\n`;
}

/**
 * The Caddy site address for one host group. A bare port (`:80`) for the
 * hostless default group; the plain hostname when TLS is on (Caddy then
 * serves it over HTTPS automatically); `http://<host>` when TLS is off, to
 * suppress Caddy's automatic-HTTPS for a named host.
 */
function gatewaySiteAddress(
  host: string | undefined,
  tls: KitSdk.Deploy.GatewayTls | undefined,
): string {
  if (!host) return ":80";
  return tls ? host : `http://${host}`;
}

/**
 * Renders the whole Caddyfile: one site block per host (rules grouped by
 * host, order preserved so the author's specific-before-catch-all ordering
 * stands), with `tls internal` injected for a self-signed local run.
 * `automatic` needs no directive — Caddy obtains real certs for a public
 * hostname on its own.
 */
function buildGatewayCaddyfile(
  routes: ResolvedGatewayRoute[],
  tls: KitSdk.Deploy.GatewayTls | undefined,
): string {
  const groups = new Map<string, ResolvedGatewayRoute[]>();
  for (const route of routes) {
    const key = route.host ?? "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(route);
  }
  const blocks: string[] = [];
  for (const [host, hostRoutes] of groups) {
    const inner = host && tls === "internal" ? ["\ttls internal\n"] : [];
    for (const route of hostRoutes) inner.push(gatewayRouteBlock(route));
    blocks.push(
      `${gatewaySiteAddress(host || undefined, tls)} {\n${inner.join("")}}\n`,
    );
  }
  return blocks.join("\n");
}

/**
 * Translates one `networking` entry. `load-balancer`, `cdn`, and `gateway`
 * all run as a Caddy service (a real local reverse-proxy — the closest
 * available approximation for each; `cdn` gets no actual caching behavior,
 * just passthrough). `dns` produces no service at all: Compose's own
 * embedded DNS already resolves every other service by name, so a `dns`
 * entry is a documented alias with nothing to run.
 */
export function translateNetworking(
  name: string,
  spec: KitSdk.Deploy.Networking,
  originUrl: string | undefined,
  routeTargets?: ResolvedGatewayRoute[],
): {
  service?: ComposeService;
  caddyfile?: string;
  output: Record<string, string>;
} {
  if (spec.type === "dns") {
    return { output: {} };
  }
  if (spec.type === "load-balancer") {
    return {
      service: { image: DEFAULT_CADDY_IMAGE, ports: ["8080:80"] },
      output: { url: `http://${name}` },
    };
  }
  if (spec.type === "gateway") {
    // Host-grouped, TLS-aware routing to each route's already-resolved
    // target — the same shape ALB listener rules / GCP URL maps / K8s
    // Gateway+HTTPRoute all express. TLS on → also publish 443 so a
    // prod-like HTTPS run works locally.
    const caddyfile = buildGatewayCaddyfile(routeTargets ?? [], spec.tls);
    const ports = spec.tls ? ["8080:80", "8443:443"] : ["8080:80"];
    return {
      service: { image: DEFAULT_CADDY_IMAGE, ports },
      caddyfile,
      output: { url: `${spec.tls ? "https" : "http"}://${name}` },
    };
  }
  // cdn: passthrough reverse-proxy to its resolved origin, no real caching —
  // the closest available local approximation. `originUrl` is the origin
  // entry's own already-resolved output (e.g. object-storage's "http://name:8333"),
  // which Caddy's reverse_proxy accepts directly as a full URL.
  const caddyfile = originUrl
    ? `:80 {\n  reverse_proxy ${originUrl}\n}\n`
    : ":80 {\n  respond 502\n}\n";
  return {
    service: { image: DEFAULT_CADDY_IMAGE, ports: ["8080:80"] },
    caddyfile,
    output: { url: `http://${name}` },
  };
}

/** Translates one `secrets` entry into Compose's native `secrets:` construct — a file mounted at `/run/secrets/<name>` inside any service that declares it, not an env var. */
export function translateSecret(
  name: string,
  _spec: KitSdk.Deploy.Secret,
): { output: Record<string, string> } {
  return { output: { path: `/run/secrets/${name}` } };
}

/** Translates one `variables` entry into its referenceable `value` output — the plain config value the deploy process's environment supplies (see main.ts's `requireVariables`). Produces no service; wired into a container only where a compute's `env` references `${variables.<name>.value}`. */
export function translateVariable(
  value: string,
): { output: Record<string, string> } {
  return { output: { value } };
}

/** Translates one `external` entry. Produces no service — nothing to run, it's a lookup, not a provision (see external.ts) — just the `name` output every `network:` reference resolves to. For compose, `external.<name>.name` is taken directly as the real Docker network name to declare `external: true` and attach to (see ensureExternalNetworkDeclared). */
export function translateExternal(
  spec: KitSdk.Deploy.External,
): { output: Record<string, string> } {
  switch (spec.type) {
    case "network":
      return { output: { name: spec.name } };
  }
}

export function ensureVolumeDeclared(doc: ComposeDocument, name: string): void {
  doc.volumes[name] = {};
}

/**
 * Declares `name` as a network in the document — Compose's own `external:
 * true` "don't create/manage, just attach" primitive for a real deploy (the
 * direct counterpart to an `external` network entry's real name, matching
 * external.ts's "looked up, not provisioned" semantics), or, in development
 * mode, a plain Compose-managed network pinned to that literal name via
 * `name:` — Compose creates it automatically if missing, since in `ens
 * develop` nothing else actually owns it and requiring it to pre-exist is
 * just friction.
 */
export function ensureExternalNetworkDeclared(
  doc: ComposeDocument,
  name: string,
  development: boolean,
): void {
  doc.networks[name] = development ? { name } : { external: true };
}
