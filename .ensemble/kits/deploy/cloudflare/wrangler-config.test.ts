import { assertEquals, assertThrows } from "@std/assert";
import { paths, plan } from "./fixtures.ts";
import type { Plan } from "./plan.ts";
import { WranglerConfigs } from "./wrangler-config.ts";

Deno.test("WranglerConfigs: a function's Worker binds its tables and buckets under the names its env uses", () => {
  const config = new WranglerConfigs(plan(), "workspace-flowed").worker(
    "api",
    paths,
    { experiences: "d1-id" },
  );
  assertEquals(config, {
    name: "workspace-flowed-api",
    main: "/work/workers/api/cloudflare.js",
    compatibility_date: "2026-09-01",
    no_bundle: true,
    workers_dev: false,
    preview_urls: false,
    vars: { EXPERIENCES_TABLE_NAME: "experiences" },
    d1_databases: [{
      binding: "experiences",
      database_name: "workspace-flowed-experiences",
      database_id: "d1-id",
    }],
    r2_buckets: [{ binding: "flowed-files", bucket_name: "flowed-files" }],
  });
});

Deno.test("WranglerConfigs: on the local runtime, buckets take its S3 stand-in's key pair, which the Worker gets too", () => {
  const config = new WranglerConfigs(
    plan({ kind: "local", port: 8787 }),
    "workspace-flowed",
  )
    .worker("api", paths, { experiences: "local-experiences" });
  const credentials = {
    accessKeyId: "ensemble-local",
    secretAccessKey: "ensemble-local-secret",
  };
  assertEquals(config.r2_buckets, [{
    binding: "flowed-files",
    bucket_name: "flowed-files",
    local_dev: { experimental_s3_credentials: credentials },
  }]);
  assertEquals(
    (config.vars as Record<string, string>)["R2_ACCESS_KEY_ID"],
    "ensemble-local",
  );
});

Deno.test("WranglerConfigs: the gateway routes to Workers, buckets and its own assets, its catch-all last", () => {
  const config = new WranglerConfigs(plan(), "workspace-flowed").gateway(
    "gateway",
    paths,
  );
  assertEquals(
    JSON.parse((config.vars as Record<string, string>)["ENSEMBLE_ROUTES"]!),
    [
      { path: "/v1/*", kind: "service", binding: "SERVICE_api" },
      { path: "/files/*", kind: "bucket", binding: "BUCKET_files" },
      { path: "/*", kind: "assets", binding: "ASSETS" },
    ],
  );
  assertEquals(config.services, [{
    binding: "SERVICE_api",
    service: "workspace-flowed-api",
  }]);
  assertEquals(config.r2_buckets, [{
    binding: "BUCKET_files",
    bucket_name: "flowed-files",
  }]);
  assertEquals(config.assets, {
    directory: "/work/sites/editor-site",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: true,
  });
  assertEquals(config.workers_dev, true);
});

Deno.test("WranglerConfigs: function Workers come before the gateway routing to them", () => {
  const all = new WranglerConfigs(plan(), "workspace-flowed").all(paths, {
    experiences: "d1-id",
  });
  assertEquals(all.map(({ resource }) => resource), ["api", "gateway"]);
});

Deno.test("WranglerConfigs: refuses a plan whose resources don't fit together", () => {
  const broken = (change: (p: Plan) => Plan) => () =>
    new WranglerConfigs(change(plan()), "x");
  assertThrows(
    broken((p) => ({ ...p, databases: {} })),
    Error,
    "no key-value table named experiences",
  );
  assertThrows(
    broken((p) => ({
      ...p,
      workers: { api: { ...p.workers["api"]!, buckets: ["flowed-editor"] } },
    })),
    Error,
    "serves as a gateway's assets",
  );
  assertThrows(
    broken((p) => ({ ...p, gateways: {} })),
    Error,
    "route one to it",
  );
  assertThrows(
    broken((p) => ({
      ...p,
      buckets: {
        ...p.buckets,
        files: { bucket: "flowed-files", contents: "/repo/other" },
      },
      workers: { api: { ...p.workers["api"]!, buckets: [] } },
    })),
    Error,
    "serves one site's files",
  );
});
