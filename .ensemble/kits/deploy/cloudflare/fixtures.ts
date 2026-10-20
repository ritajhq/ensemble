import type { Plan } from "./plan.ts";

/** A stack like the one this kit was made for: an API with a table and a files bucket, a site, and a gateway in front. */
export function plan(
  target: Plan["target"] = { kind: "remote", accountId: "acc" },
): Plan {
  return {
    target,
    workers: {
      api: {
        code: "/repo/source/artifacts/packages/api.zip",
        env: { EXPERIENCES_TABLE_NAME: "experiences" },
        tables: ["experiences"],
        buckets: ["flowed-files"],
        sync: [{ app: "server", path: "/" }],
      },
    },
    databases: { experiences: { partition: "PK", sort: "SK" } },
    buckets: {
      files: {
        bucket: "flowed-files",
        cors: [{
          origins: ["*"],
          methods: ["PUT"],
          headers: ["*"],
          maxAge: 3600,
        }],
      },
      "editor-site": {
        bucket: "flowed-editor",
        contents: "/repo/source/artifacts/editor",
        sync: [{ app: "editor", path: "/" }],
      },
    },
    gateways: {
      gateway: {
        routes: [
          { path: "/*", target: { storage: "editor-site" } },
          { path: "/v1/*", target: { service: "api" } },
          { path: "/files/*", target: { storage: "files" } },
        ],
      },
    },
  };
}

export const paths = {
  workerMain: (worker: string) => `/work/workers/${worker}/cloudflare.js`,
  gatewayMain: "/work/gateway/gateway.js",
  assets: (bucket: string) => `/work/sites/${bucket}`,
};
