import * as KitSdk from "@ensemble/kit-sdk";
import { syncRules } from "../development-sync.ts";
import type { CorsRule, Fragment } from "../plan.ts";
import { bucketUrl, targetOf } from "../target.ts";

const CORS_METHODS = new Set(["GET", "PUT", "POST", "DELETE", "HEAD"]);

/** `cors` as R2 takes it — S3's own model, which R2 implements; `undefined` when there are none. */
function corsRules(raw: unknown, name: string): CorsRule[] | undefined {
  if (raw === undefined) return undefined;
  const rules = raw as readonly Record<string, unknown>[];
  return rules.map((rule, index) => {
    const field = `storage.${name}.cors[${index}]`;
    const methods = stringList(rule.methods, `${field}.methods`, true).map((
      m,
    ) => m.toUpperCase());
    const unknown = methods.filter((m) => !CORS_METHODS.has(m));
    if (unknown.length > 0) {
      throw new Error(
        `${field}.methods: R2 allows ${[...CORS_METHODS].join(", ")}, not ${
          unknown.join(", ")
        }.`,
      );
    }
    if (rule.maxAge !== undefined && !Number.isInteger(rule.maxAge)) {
      throw new Error(`${field}.maxAge must be a whole number of seconds.`);
    }
    const headers = stringList(rule.headers, `${field}.headers`, false);
    const exposeHeaders = stringList(
      rule.exposeHeaders,
      `${field}.exposeHeaders`,
      false,
    );
    return {
      origins: stringList(rule.origins, `${field}.origins`, true),
      methods,
      ...(headers.length > 0 ? { headers } : {}),
      ...(exposeHeaders.length > 0 ? { exposeHeaders } : {}),
      ...(rule.maxAge !== undefined ? { maxAge: rule.maxAge as number } : {}),
    };
  });
}

function stringList(raw: unknown, field: string, required: boolean): string[] {
  if (raw === undefined && !required) return [];
  if (
    Array.isArray(raw) && raw.length > 0 &&
    raw.every((item) => typeof item === "string")
  ) return raw;
  throw new Error(`${field} must be a non-empty list of strings.`);
}

/**
 * Fulfills `object-storage` on cloudflare as an R2 bucket — except one with
 * `contents`, a site's files, which becomes the static assets of the gateway
 * Worker serving it (Workers' own way to serve files, with no bucket to keep
 * in sync). `cors` is the bucket's R2 CORS configuration. Its `url` and
 * `publicUrl` are both its S3 API — R2's own endpoint for the account, which
 * a browser reaches as well as a Worker does; on the local runtime, the
 * stand-in it serves for it, on the same port as everything else.
 * `accessKeySecret`/`secretKeySecret` are dropped, as on aws: R2 mints its
 * key pairs, it isn't handed one. Under `ens develop`, `development.sync`
 * serves a site's assets straight from its app's build output.
 */
export function objectStorageProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "storage" &&
      resource.declaration.type === "object-storage",
    // deno-lint-ignore require-await
    describe: async () => "object storage (R2, or a gateway's assets)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const where = `storage.${request.name}`;
      const bucket = request.params.bucket as string;
      const contents = request.params.contents as string | undefined;
      const cors = corsRules(request.params.cors, request.name);
      const sync = syncRules(request.params.development, where, {
        restart: true,
      });
      if (sync && contents === undefined) {
        throw new Error(
          `${where}: development.sync keeps "contents" current, but the bucket declares none.`,
        );
      }
      const url = bucketUrl(targetOf(Deno.env.toObject()), bucket);
      const content: Fragment = {
        buckets: {
          [request.name]: {
            bucket,
            ...(contents ? { contents } : {}),
            ...(cors ? { cors } : {}),
            ...(sync ? { sync } : {}),
          },
        },
      };
      return {
        fragment: { category: request.category, name: request.name, content },
        outputs: { bucket, url, publicUrl: url },
      };
    },
  };
}
