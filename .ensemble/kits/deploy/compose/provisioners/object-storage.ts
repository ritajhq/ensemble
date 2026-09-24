import * as KitSdk from "@ensemble/kit-sdk";
import { composeSecretWiring } from "../secret-wiring.ts";
import { garageSeedScript, garageToml } from "./garage-config.ts";

const GARAGE_IMAGE = "dxflrs/garage:v1.0.1";
const S3_API_PORT = 3900;

/**
 * `accessKeySecret`/`secretKeySecret` are optional on the contract (an
 * aws-only manifest never needs them — see `object-storage.v1`'s own
 * comment), but Garage has no other way to get static S3 credentials, so
 * compose's own provisioner requires them at render time and says exactly
 * why when they're missing, rather than the contract rejecting an aws-only
 * manifest that never needed them.
 */
function requiredCredential(
  value: unknown,
  field: string,
  resourceName: string,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `storage.${resourceName} needs "${field}" to seed Garage's static credentials on compose (aws can drop it; Garage can't).`,
    );
  }
  return value;
}

/**
 * Fulfills `object-storage` (Garage) on compose. The service runs Garage's own
 * image entrypoint against the generated config — deliberately: Garage's
 * layout/bucket/key state is only ever created through Garage's own CLI, and
 * the official image is `scratch`, so there is no shell in which an entrypoint
 * script could drive it. That CLI work is declared as an `initCommand`
 * instead, for the core to run from the host once the apply has brought the
 * container up (`garageSeedScript`). `class: critical` gets a persistent named
 * volume for `/var/lib/garage`, same convention `relational`'s own provisioner
 * already uses for its data volume — anything less than critical is ephemeral,
 * losing the bucket's layout/keys/objects on every restart (acceptable for a
 * "spin it up for now" instance, not for one meant to keep data; the seed
 * command simply re-seeds the fresh container).
 */
export function objectStorageProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "storage" &&
      resource.declaration.type === "object-storage",
    // deno-lint-ignore require-await
    describe: async () => "object storage (Garage container)",
    provision: async (request) => {
      const bucket = request.params.bucket as string;
      const accessKey = composeSecretWiring(
        requiredCredential(
          request.params.accessKeySecret,
          "accessKeySecret",
          request.name,
        ),
        request.secrets,
      );
      const secretKey = composeSecretWiring(
        requiredCredential(
          request.params.secretKeySecret,
          "secretKeySecret",
          request.name,
        ),
        request.secrets,
      );

      const tomlConfigName = `${request.name}-garage-toml`;
      const critical = request.class === "critical";
      const volumeName = `${request.name}-data`;

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            service: {
              image: GARAGE_IMAGE,
              ports: [`${S3_API_PORT}:${S3_API_PORT}`],
              configs: [
                { source: tomlConfigName, target: "/etc/garage.toml" },
              ],
              ...(critical
                ? { volumes: [`${volumeName}:/var/lib/garage`] }
                : {}),
            },
            configs: {
              [tomlConfigName]: { content: await garageToml(request.name) },
            },
            ...(critical ? { volumes: { [volumeName]: {} } } : {}),
          },
        },
        outputs: {
          url: `http://${request.name}:${S3_API_PORT}`,
          bucket,
        },
        initCommands: [{
          name: `${request.name}-garage-seed`,
          run: garageSeedScript({
            service: request.name,
            bucket,
            accessKey,
            secretKey,
          }),
        }],
      };
    },
  };
}
