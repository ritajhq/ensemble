import * as KitSdk from "@ensemble/kit-sdk";
import { PROJECT_NETWORK } from "../compose-document.ts";
import { caddyfile } from "./caddy-config.ts";

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
 * - `networks` lists the manifest's ingress network **and** the project's own
 *   network. Every compute the gateway routes to sits on the latter (only the
 *   gateway itself is declared onto `${external.*}`), and a reverse proxy can
 *   only reach an upstream it shares a network with — without this the
 *   generated config names hosts this container has no route to, and Caddy
 *   resolves upstreams when it loads its config, so the gateway doesn't
 *   degrade, it fails to start.
 * - `/data` gets a named volume. That's where Caddy keeps the local CA, so a
 *   recreated container without one mints a fresh CA and silently invalidates
 *   whatever the developer already trusted (`ci/scripts/trust-gateway-ca.sh`
 *   in this repo's own portal).
 *
 * Published on `8443:443` when `tls` is set, `80:80` when it isn't — HTTPS
 * only in the former case, deliberately: Caddy's automatic HTTP→HTTPS
 * redirect names Caddy's own 443, which a host-side 8443 mapping can't
 * reflect, so publishing 80 alongside it would only produce redirects to a
 * port nothing is listening on.
 */
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
      const tls = request.params.tls as string | undefined;

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            service: {
              image: CADDY_IMAGE,
              ports: tls ? [`${HTTPS_HOST_PORT}:443`] : ["80:80"],
              networks: [request.params.network, PROJECT_NETWORK],
              configs: [
                { source: configName, target: "/etc/caddy/Caddyfile" },
              ],
              volumes: [`${volumeName}:/data`],
            },
            configs: {
              [configName]: { content: caddyfile(routes, tls) },
            },
            volumes: { [volumeName]: {} },
          },
        },
        outputs: {},
      };
    },
  };
}
