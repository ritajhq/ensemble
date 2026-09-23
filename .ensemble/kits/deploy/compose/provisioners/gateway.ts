import * as KitSdk from "@ensemble/kit-sdk";
import { nginxConf } from "./nginx-config.ts";

const NGINX_IMAGE = "nginx:1.27-alpine";

/**
 * Fulfills `gateway` (nginx) on compose — the only kit this Type is
 * implemented on (`../../../../source/core/core/deploy/contracts/seeds/
 * gateway.ts`'s own comment explains why there's no aws provisioner).
 * `routes` arrives here already resolved: each entry's `target.port` was a
 * `${compute.<name>.<port>}` reference, baked to a bare number by render
 * time same as every other compute-port reference; `target.service` was
 * always a plain string, never a reference, so it passes through untouched
 * (`gateway.v1`'s own contract comment explains why the two are split apart
 * rather than one combined reference).
 *
 * The generated `nginx.conf` becomes a compose `configs:` entry with inline
 * `content:` — no host file to write and no second artifact for `present()`
 * to emit, the same "everything lives inside compose.yaml itself" shape
 * `relational`'s own named volume already uses for its persistent storage.
 * Published on `80:80` only; TLS isn't rendered (see the contract comment).
 */
export function gatewayProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) => resource.declaration.type === "gateway",
    // deno-lint-ignore require-await
    describe: async () => "gateway (nginx reverse proxy)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const configName = `${request.name}-nginx-conf`;
      const routes = request.params.routes as Parameters<typeof nginxConf>[0];

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            service: {
              image: NGINX_IMAGE,
              ports: ["80:80"],
              networks: [request.params.network],
              configs: [
                { source: configName, target: "/etc/nginx/nginx.conf" },
              ],
            },
            configs: {
              [configName]: { content: nginxConf(routes) },
            },
          },
        },
        outputs: {},
      };
    },
  };
}
