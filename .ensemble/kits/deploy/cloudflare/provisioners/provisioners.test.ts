import { assertEquals, assertRejects } from "@std/assert";
import type * as KitSdk from "@ensemble/kit-sdk";
import { functionProvisioner } from "./function.ts";
import { gatewayProvisioner } from "./gateway.ts";
import { keyValueProvisioner } from "./key-value.ts";
import { objectStorageProvisioner } from "./object-storage.ts";

function request(
  category: KitSdk.Deploy.Category,
  type: string,
  params: Record<string, unknown>,
  mode?: KitSdk.Deploy.Mode,
): KitSdk.Deploy.ResolvedRequest {
  return {
    category,
    name: "it",
    type,
    params,
    values: {},
    secrets: {},
    ...(mode ? { mode } : {}),
  };
}

async function withEnv<T>(
  env: Record<string, string | undefined>,
  body: () => Promise<T>,
): Promise<T> {
  const before = Object.fromEntries(
    Object.keys(env).map((name) => [name, Deno.env.get(name)]),
  );
  const apply = (values: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  };
  apply(env);
  try {
    return await body();
  } finally {
    apply(before);
  }
}

Deno.test("cloudflare function: a Worker with its env as vars, development.env only under ens develop", async () => {
  const params = {
    code: "/api.zip",
    env: { TABLE: "experiences", PORT: 8 },
    tables: ["experiences"],
    development: { env: { DEBUG: "1" } },
  };
  const developing = await functionProvisioner().provision!(
    request("compute", "function", params, "development"),
  );
  assertEquals(
    (developing.fragment.content as { workers: Record<string, unknown> })
      .workers["it"],
    {
      code: "/api.zip",
      env: { TABLE: "experiences", PORT: "8", DEBUG: "1" },
      tables: ["experiences"],
      buckets: [],
    },
  );
  const deployed = await functionProvisioner().provision!(
    request("compute", "function", params, "deployment"),
  );
  assertEquals(
    (deployed.fragment.content as { workers: Record<string, { env: unknown }> })
      .workers["it"]!.env,
    {
      TABLE: "experiences",
      PORT: "8",
    },
  );
});

Deno.test("cloudflare key-value: a D1 database keyed like the table", async () => {
  const outcome = await keyValueProvisioner().provision!(
    request("databases", "key-value", {
      keySchema: { partition: "PK", sort: "SK" },
    }),
  );
  assertEquals(outcome.fragment.content, {
    databases: { it: { partition: "PK", sort: "SK" } },
  });
  assertEquals(outcome.outputs, { name: "it" });
});

Deno.test("cloudflare object storage: its S3 API is R2's for the account, or the local runtime's stand-in", async () => {
  const params = { bucket: "files", accessKeySecret: "dropped" };
  const remote = await withEnv(
    { ENS_CLOUDFLARE_TARGET: undefined, CLOUDFLARE_ACCOUNT_ID: "acc" },
    () =>
      objectStorageProvisioner().provision!(
        request("storage", "object-storage", params),
      ),
  );
  assertEquals(remote.outputs, {
    bucket: "files",
    url: "https://acc.r2.cloudflarestorage.com/files",
    publicUrl: "https://acc.r2.cloudflarestorage.com/files",
  });
  assertEquals(remote.fragment.content, {
    buckets: { it: { bucket: "files" } },
  });
  const local = await withEnv(
    { ENS_CLOUDFLARE_TARGET: "local", ENS_CLOUDFLARE_PORT: "9000" },
    () =>
      objectStorageProvisioner().provision!(
        request("storage", "object-storage", params),
      ),
  );
  assertEquals(
    local.outputs.publicUrl,
    "http://localhost:9000/cdn-cgi/local/r2/s3/files",
  );
});

Deno.test("cloudflare object storage: syncing development needs contents to keep current", async () => {
  await withEnv({ ENS_CLOUDFLARE_TARGET: "local" }, async () => {
    await assertRejects(
      () =>
        objectStorageProvisioner().provision!(
          request("storage", "object-storage", {
            bucket: "b",
            development: { sync: [{ app: "editor", path: "/" }] },
          }),
        ),
      Error,
      "declares none",
    );
    await assertRejects(
      () =>
        objectStorageProvisioner().provision!(
          request("storage", "object-storage", {
            bucket: "b",
            cors: [{ origins: ["*"], methods: ["PATCH"] }],
          }),
        ),
      Error,
      "not PATCH",
    );
  });
});

Deno.test("cloudflare gateway: routes by path to exactly one target each", async () => {
  const routes = [{ path: "/v1/*", target: { service: "api" } }, {
    path: "/*",
    target: { storage: "site" },
  }];
  const outcome = await gatewayProvisioner().provision!(
    request("networking", "gateway", { routes }),
  );
  assertEquals(outcome.fragment.content, { gateways: { it: { routes } } });
  await assertRejects(
    () =>
      gatewayProvisioner().provision!(
        request("networking", "gateway", {
          routes: [{ path: "/", target: { service: "a", storage: "b" } }],
        }),
      ),
    Error,
    "exactly one",
  );
  await assertRejects(
    () =>
      gatewayProvisioner().provision!(
        request("networking", "gateway", {
          routes: [{ path: "/", host: "x.example", target: { service: "a" } }],
        }),
      ),
    Error,
    "custom domains",
  );
});
