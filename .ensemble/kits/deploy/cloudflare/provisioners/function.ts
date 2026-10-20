import * as KitSdk from "@ensemble/kit-sdk";
import { syncRules } from "../development-sync.ts";
import type { Fragment } from "../plan.ts";

/**
 * The function's environment as a Worker's plain-text vars, plus its
 * `development.env` additions under `ens develop` only. Naming a variable
 * `env` already sets is an error, not an override, as on every kit.
 */
function environmentOf(
  request: KitSdk.Deploy.ResolvedRequest,
): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(
      (request.params.env as Record<string, unknown> | undefined) ?? {},
    ).map(([name, value]) => [
      name,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
  if (request.params.development === undefined) return env;
  const additions =
    KitSdk.Deploy.parseDevelopmentBlock(request.params.development).env;
  const replaced = Object.keys(additions).filter((name) => name in env);
  if (replaced.length > 0) {
    throw new Error(
      `compute.${request.name}: development.env may only add variables, but ${
        replaced.join(", ")
      } already set by env.`,
    );
  }
  if (request.mode !== "development") return env;
  return { ...env, ...additions };
}

function names(raw: unknown, field: string, name: string): string[] {
  if (raw === undefined) return [];
  if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
    return raw;
  }
  throw new Error(`compute.${name}: "${field}" must be a list of names.`);
}

/**
 * Fulfills `function` on cloudflare as a Worker running its bundle's own
 * `cloudflare.js` entry — the Workers module shape `function.v1` asks every
 * bundle's entries for, so nothing adapts it. Its `env` becomes the Worker's
 * vars; each table it's granted is bound as a D1 database, each bucket as an
 * R2 bucket, under the very name `env` reaches it by. A Worker granted
 * buckets also gets the R2 key pair its S3 API takes, as
 * `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` — Workers have no role to sign
 * with. `runtime` has nothing to choose: Workers run one.
 */
export function functionProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "compute" &&
      resource.declaration.type === "function",
    // deno-lint-ignore require-await
    describe: async () => "function (Worker)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const sync = syncRules(
        request.params.development,
        `compute.${request.name}`,
      );
      const content: Fragment = {
        workers: {
          [request.name]: {
            code: String(request.params.code),
            env: environmentOf(request),
            tables: names(request.params.tables, "tables", request.name),
            buckets: names(request.params.buckets, "buckets", request.name),
            ...(sync ? { sync } : {}),
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
