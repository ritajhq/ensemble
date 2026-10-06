import * as KitSdk from "@ensemble/kit-sdk";
import { PROJECT_NETWORK } from "../compose-document.ts";
import { caddyfile, type Tls, tlsMode } from "./caddy-config.ts";

/**
 * Caddy's own official image, and the reason this kit's gateway is Caddy:
 * `tls: internal` is a single directive — Caddy mints a local CA, issues and
 * rotates the leaf certs itself, and serves them with no cert file to
 * generate, mount or reload from here. Anything leaner (nginx) means
 * rendering a CA and a leaf, mounting both, and handling renewal, i.e.
 * rebuilding this inside the kit. A local-only dev ingress is exactly the
 * case that trades little for it.
 */
const CADDY_IMAGE = "caddy:2.11-alpine";
/** The host port an HTTPS gateway is reached on, mapping Caddy's own 443 — the port every app's own origins in this repo already spell (`https://<host>.localhost:8443`). */
const HTTPS_HOST_PORT = 8443;

/** What the gateway publishes on the host when nothing fronts it, per `Tls` — see `gatewayProvisioner` for why HTTPS publishes 8443 alone. */
const PUBLISHED_PORTS: Readonly<Record<Tls, readonly string[]>> = {
  internal: [`${HTTPS_HOST_PORT}:443`],
  none: ["80:80"],
};

/**
 * Narrows a gateway's resolved `networks` param to its network names: absent
 * is none, and anything but a list of strings (say a plain, non-`list`
 * variable) is rejected rather than rendered as a network named after it.
 */
function ingressNetworks(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  throw new Error(
    `A gateway's networks must be a list of network names (got ${
      JSON.stringify(value)
    }) — a variable feeding it needs \`type: list\`.`,
  );
}

/**
 * Fulfills `gateway` (Caddy) on compose — the only kit this Type is
 * implemented on (`../../../../source/core/core/deploy/contracts/seeds/
 * gateway.ts`'s own comment explains why there's no aws provisioner).
 * `routes` arrives here already resolved: each entry's `target.port` was a
 * `${compute.<name>.<port>}` reference, baked to a bare number by render
 * time same as every other compute-port reference; `target.service` was
 * always a plain string, never a reference, so it passes through untouched
 * (`gateway.v1`'s own contract comment explains why the two are split apart
 * rather than one combined reference).
 *
 * The generated `Caddyfile` becomes a compose `configs:` entry with inline
 * `content:` — no host file to write and no second artifact for `present()`
 * to emit, the same "everything lives inside compose.yaml itself" shape
 * `relational`'s own named volume already uses for its persistent storage.
 * Mounted at the image's own default path, so nothing has to pass `--config`.
 *
 * Two things about the service entry are load-bearing rather than incidental:
 *
 * - `networks` lists the manifest's ingress networks **and** the project's
 *   own network. Every compute the gateway routes to sits on the latter
 *   (only the gateway itself joins an ingress network), and a reverse proxy
 *   can only reach an upstream it shares a network with — without this the
 *   generated config names hosts this container has no route to, and Caddy
 *   resolves upstreams when it loads its config, so the gateway doesn't
 *   degrade, it fails to start.
 * - `/data` gets a named volume. That's where Caddy keeps the local CA, so a
 *   recreated container without one mints a fresh CA and silently invalidates
 *   whatever the developer already trusted (`ci/scripts/trust-gateway-ca.sh`
 *   in this repo's own portal).
 *
 * Ports are published only when the manifest gives the gateway no ingress
 * networks: then nothing fronts it and the host is the only way in (`ens
 * develop`, browsing `https://<host>:8443`). With ingress networks, whatever
 * sits on them (a host-level proxy, a tunnel) reaches it there, so it binds
 * no host port at all — nothing on the host can reach it around that proxy,
 * and two such stacks on one host never fight over port 80.
 *
 * Published on `8443:443` for `tls: internal`, `80:80` for `none` — HTTPS
 * only in the former case, deliberately: Caddy's automatic HTTP→HTTPS
 * redirect names Caddy's own 443, which a host-side 8443 mapping can't
 * reflect, so publishing 80 alongside it would only produce redirects to a
 * port nothing is listening on.
 */
/**
 * Pushes the rendered Caddyfile into the running gateway through Caddy's
 * admin API (`POST /load`, on the container's own loopback, so it is never
 * exposed). Compose only reads an inline `configs:` entry when it creates a
 * container, and doesn't recreate one when only that content changed: without
 * this, a redeploy that adds a route leaves the gateway serving the old ones.
 * Loading the same config again is a no-op for Caddy, so it is safe on every
 * apply. Retried while a freshly started Caddy brings its admin API up.
 */
export function caddyReloadScript(service: string, config: string): string {
  return `for attempt in 1 2 3 4 5 6 7 8 9 10; do
  docker compose -f "$ENS_ARTIFACT_PATH" -p "$ENS_DEPLOYMENT_NAME" exec -T ${service} \
    wget -qO- --header 'Content-Type: text/caddyfile' --post-file=/dev/stdin http://127.0.0.1:2019/load <<'ENS_CADDYFILE' && exit 0
${config.trimEnd()}
ENS_CADDYFILE
  sleep 1
done
exit 1`;
}

export function gatewayProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) => resource.declaration.type === "gateway",
    // deno-lint-ignore require-await
    describe: async () => "gateway (Caddy reverse proxy)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const configName = `${request.name}-caddyfile`;
      const volumeName = `${request.name}-data`;
      const routes = request.params.routes as Parameters<typeof caddyfile>[0];
      const tls = tlsMode(request.params.tls);
      const ingress = ingressNetworks(request.params.networks);
      const config = caddyfile(routes, tls);

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            service: {
              image: CADDY_IMAGE,
              ...(ingress.length === 0
                ? { ports: [...PUBLISHED_PORTS[tls]] }
                : {}),
              networks: [...ingress, PROJECT_NETWORK],
              configs: [
                { source: configName, target: "/etc/caddy/Caddyfile" },
              ],
              volumes: [`${volumeName}:/data`],
            },
            configs: {
              [configName]: { content: config },
            },
            volumes: { [volumeName]: {} },
          },
        },
        outputs: {},
        initCommands: [{
          name: `${request.name}-caddy-reload`,
          run: caddyReloadScript(request.name, config),
        }],
      };
    },
  };
}
