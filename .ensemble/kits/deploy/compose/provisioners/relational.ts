import { basename } from "@std/path";
import * as KitSdk from "@ensemble/kit-sdk";
import { composeSecretWiring } from "../secret-wiring.ts";

const POSTGRES_PORT = 5432;

/**
 * Each `init` entry — an absolute path, already resolved from its
 * manifest-relative form by `loadDeployContext` (a provisioner never gets
 * repo-relative context of its own, G6) — as a read-only bind mount into
 * postgres's own `docker-entrypoint-initdb.d` convention, which runs
 * `.sql`/`.sql.gz`/`.sh` files there in filename order against a fresh
 * (empty) data volume. `[]` when there's no `init` param — same
 * "absent, not empty" convention `portMappings`/`mountVolumes` use on
 * container-orchestrated's own provisioner.
 */
function initMounts(init: unknown): string[] {
  if (!Array.isArray(init)) return [];
  return (init as string[]).map((path) =>
    `${path}:/docker-entrypoint-initdb.d/${basename(path)}:ro`
  );
}

/**
 * Fulfills `relational` (postgres) on compose. `host` is `static` — it's
 * just the compose service name, never a provider-allocated endpoint (G3,
 * the compiler-stance proof this whole worked example exists to make).
 * `class: critical` adds a persistent named volume and `restart: always`
 * (Appendix A: "no multi-AZ concept locally") — read directly off
 * `request.class`, not through the negotiated `multiAz`/`backupRetention`
 * concern values, since those have no compose-artifact equivalent to carry
 * them into (see realization.ts's own note on this). `init` mounts are
 * independent of `class`: a non-critical (ephemeral) database can still
 * want seed data.
 */
export function relationalProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) => resource.declaration.type === "relational",
    // deno-lint-ignore require-await
    describe: async () => "relational (postgres container + volume)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const passwordWiring = composeSecretWiring(
        String(request.params.passwordSecret),
        request.secrets,
      );
      const critical = request.class === "critical";
      const volumeName = `${request.name}-data`;
      const volumes = [
        ...(critical ? [`${volumeName}:/var/lib/postgresql/data`] : []),
        ...initMounts(request.params.init),
      ];

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
              ...(volumes.length > 0 ? { volumes } : {}),
              ...(critical ? { restart: "always" } : {}),
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
