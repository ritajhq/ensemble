import * as KitSdk from "@ensemble/kit-sdk";

/**
 * Fulfills `storage.volume` on compose as a top-level named volume — no
 * `service` entry of its own (a volume isn't a container), just a
 * `content.volumes` fragment `assembleComposeDocument`
 * (`../compose-document.ts`) folds into the document's own `volumes:` block,
 * same as `relational`'s own `class: critical` volume already does inline.
 * `name` is `static` (`../realization.ts`): like a compose service, it's
 * just the resource's own manifest name, never provider-allocated — a
 * `container-orchestrated` compute's `mounts` entry references it as
 * `${storage.<name>.name}`.
 */
export function storageVolumeProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "storage" && resource.declaration.type === "volume",
    // deno-lint-ignore require-await
    describe: async () => "storage volume (compose named volume)",
    // deno-lint-ignore require-await
    provision: async (request) => ({
      fragment: {
        category: request.category,
        name: request.name,
        content: {
          volumes: { [request.name]: {} },
        },
      },
      outputs: { name: request.name },
    }),
  };
}
