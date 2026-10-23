import type { Route, Tls } from "./caddy-config.ts";

/**
 * caddy-docker-proxy, pinned: the one entrypoint every stack brought up with
 * `ens develop` is reached through, in place of the host-level gateway a real
 * host keeps by hand. It builds its Caddyfile from the labels containers
 * carry, so a stack's gateway only has to say which hosts it answers for.
 */
const PROXY_IMAGE = "lucaslorentz/caddy-docker-proxy:2.9-alpine";

/**
 * The shared proxy `ens develop` puts in front of gateways that sit on
 * ingress networks, which nothing on the host reaches otherwise: it joins
 * those networks and publishes 80 and 443 once for every stack, where a
 * gateway published on its own port would need one per stack.
 */
export class LocalProxy {
  /** One for the whole host, found by this name by every stack that needs it. */
  static readonly CONTAINER = "ens-local-proxy";

  constructor(private readonly networks: readonly string[]) {}

  /**
   * The proxy for a rendered compose document: it joins the networks of every
   * service labelled for it, but the stack's own, which compose creates and
   * names after the project.
   */
  static of(document: { services?: Record<string, unknown> }): LocalProxy {
    const networks = new Set<string>();
    for (const service of Object.values(document.services ?? {})) {
      const { labels, networks: attached } = service as {
        labels?: Record<string, string>;
        networks?: string[] | Record<string, unknown>;
      };
      if (labels?.caddy === undefined) continue;
      const names = Array.isArray(attached)
        ? attached
        : Object.keys(attached ?? {});
      names.filter((name) => name !== "default").forEach((name) =>
        networks.add(name)
      );
    }
    return new LocalProxy([...networks]);
  }

  /** Whether there is a gateway to put it in front of. */
  get isNeeded(): boolean {
    return this.networks.length > 0;
  }

  /**
   * What a gateway carries for the proxy to route its hosts to it, each route
   * host terminating TLS at the proxy with its local CA — what a tunnel does
   * on a real host. A gateway serving HTTPS itself (`tls: internal`) is asked
   * over HTTPS, its certificate not verified: it is the proxy's own upstream.
   * A route with no host has nothing to be matched by.
   */
  labelsFor(routes: readonly Route[], tls: Tls): Record<string, string> {
    const hosts = [...new Set(routes.map((route) => route.host))].filter(
      (host) => host !== "",
    );
    if (hosts.length === 0) return {};
    const upstream: Record<string, string> = tls === "internal"
      ? {
        "caddy.reverse_proxy": "{{upstreams https 443}}",
        "caddy.reverse_proxy.transport": "http",
        "caddy.reverse_proxy.transport.tls_insecure_skip_verify": "",
      }
      : { "caddy.reverse_proxy": "{{upstreams 80}}" };
    return {
      caddy: hosts.join(", "),
      "caddy.tls": "internal",
      ...upstream,
    };
  }

  /**
   * Starts the proxy if this host has none yet and puts it on every network
   * the gateway is reached through. It reads the networks it is on once, when
   * it starts, so one it has just joined only counts after a restart.
   */
  startScript(): string {
    const proxy = LocalProxy.CONTAINER;
    return `proxy=${proxy}
docker inspect "$proxy" >/dev/null 2>&1 || docker run -d --name "$proxy" \\
  --restart unless-stopped -p 80:80 -p 443:443 \\
  -v /var/run/docker.sock:/var/run/docker.sock -v "$proxy-data:/data" \\
  ${PROXY_IMAGE} >/dev/null
joined=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$proxy")
changed=
for network in ${this.networks.map(shellQuoted).join(" ")}; do
  case " $joined " in *" $network "*) continue ;; esac
  docker network connect "$network" "$proxy"
  changed=1
done
[ -z "$changed" ] || docker restart "$proxy" >/dev/null`;
  }
}

function shellQuoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
