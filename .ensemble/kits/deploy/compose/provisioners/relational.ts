import * as KitSdk from "@ensemble/kit-sdk";
import { composeSecretWiring } from "../secret-wiring.ts";

const POSTGRES_PORT = 5432;

/**
 * Fulfills `relational` (postgres) on compose. `host` is `static` — it's
 * just the compose service name, never a provider-allocated endpoint (G3,
 * the compiler-stance proof this whole worked example exists to make).
 * `class: critical` adds a persistent named volume and `restart: always`
 * (Appendix A: "no multi-AZ concept locally") — read directly off
 * `request.class`, not through the negotiated `multiAz`/`backupRetention`
 * concern values, since those have no compose-artifact equivalent to carry
 * them into (see realization.ts's own note on this).
 */
export function relationalProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) => resource.declaration.type === "relational",
    // deno-lint-ignore require-await
    describe: async () => "relational (postgres container + volume)",
    provision: async (request) => {
      const passwordWiring = composeSecretWiring(
        String(request.params.passwordSecret),
        request.secrets,
      );
      const critical = request.class === "critical";
      const volumeName = `${request.name}-data`;

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            service: {
              image: `postgres:${request.params.version}`,
              environment: {
                POSTGRES_USER: request.params.user,
                POSTGRES_DB: request.params.database,
                POSTGRES_PASSWORD: passwordWiring,
              },
              ...(critical
                ? {
                  volumes: [`${volumeName}:/var/lib/postgresql/data`],
                  restart: "always",
                }
                : {}),
            },
            ...(critical ? { volumes: { [volumeName]: {} } } : {}),
          },
        },
        outputs: {
          host: request.name,
          port: POSTGRES_PORT,
          user: request.params.user,
          database: request.params.database,
          url:
            `postgres://${request.params.user}:${passwordWiring}@${request.name}:${POSTGRES_PORT}/${request.params.database}`,
        },
      };
    },
  };
}
