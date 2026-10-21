import * as KitSdk from "@ensemble/kit-sdk";
import type { Fragment } from "../plan.ts";

/**
 * Fulfills `key-value` on cloudflare as a D1 database of its own holding one
 * table, `items`: the key attributes as its columns — the primary key — and
 * every other attribute of an item in `attributes`, one JSON object. Not
 * Workers KV: KV is eventually consistent and can't write only if an item
 * hasn't changed, which a table read and written concurrently needs; D1
 * runs a batch of statements as one transaction, so it can. The table is
 * named after the resource, as on every kit, and that's also the name its
 * functions find it bound under.
 */
export function keyValueProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "databases" &&
      resource.declaration.type === "key-value",
    // deno-lint-ignore require-await
    describe: async () => "key-value (D1)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const keySchema = KitSdk.Deploy.parseKeySchema(request.params.keySchema);
      const content: Fragment = {
        databases: {
          [request.name]: {
            partition: keySchema.partition,
            ...(keySchema.sort ? { sort: keySchema.sort } : {}),
          },
        },
      };
      return {
        fragment: { category: request.category, name: request.name, content },
        outputs: { name: request.name },
      };
    },
  };
}
