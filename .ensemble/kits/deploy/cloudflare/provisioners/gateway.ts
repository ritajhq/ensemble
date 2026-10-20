import type * as KitSdk from "@ensemble/kit-sdk";
import type { Fragment, Route } from "../plan.ts";

function parseRoutes(raw: unknown, gateway: string): Route[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`gateway ${gateway}: "routes" must be a non-empty list.`);
  }
  return raw.map((entry, index) => {
    const route = entry as {
      path?: unknown;
      host?: unknown;
      target?: { service?: unknown; storage?: unknown };
    };
    if (route.host !== undefined) {
      throw new Error(
        `gateway ${gateway}: routes[${index}].host — custom domains aren't supported by the cloudflare kit yet; route by path only.`,
      );
    }
    const target = route.target ?? {};
    const service = typeof target.service === "string"
      ? target.service
      : undefined;
    const storage = typeof target.storage === "string"
      ? target.storage
      : undefined;
    if (
      typeof route.path !== "string" || !route.path.startsWith("/") ||
      !service === !storage
    ) {
      throw new Error(
        `gateway ${gateway}: routes[${index}] needs a "path" and a target naming exactly one of "service" (a function) or "storage" (a bucket).`,
      );
    }
    return {
      path: route.path,
      target: service ? { service } : { storage: storage! },
    };
  });
}

/**
 * Fulfills `gateway` on cloudflare as a Worker of its own in front of the
 * others (`../runtime/gateway.js`): a `service` route hands the request to
 * that function's Worker (a service binding), a `storage` route serves the
 * bucket's objects — from R2, or from the gateway's own static assets for a
 * bucket with `contents`, falling back to `/index.html` for paths that
 * aren't files, so a single-page app's routes load. Exact paths and `/x/*`
 * prefixes match in the order declared; the catch-all (`/*`) last.
 */
export function gatewayProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "networking" &&
      resource.declaration.type === "gateway",
    // deno-lint-ignore require-await
    describe: async () => "gateway (Worker)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const content: Fragment = {
        gateways: {
          [request.name]: {
            routes: parseRoutes(request.params.routes, request.name),
          },
        },
      };
      return {
        fragment: { category: request.category, name: request.name, content },
        outputs: {},
      };
    },
  };
}
