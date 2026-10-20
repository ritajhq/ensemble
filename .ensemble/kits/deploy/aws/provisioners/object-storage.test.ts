import { assertEquals, assertRejects } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { objectStorageProvisioner } from "./object-storage.ts";
import { DEVELOPMENT_METADATA } from "../development-sync.ts";

function request(
  params: Record<string, unknown>,
): KitSdk.Deploy.ResolvedRequest {
  return {
    category: "storage",
    name: "site",
    type: "object-storage",
    params: { bucket: "my-site", ...params },
    values: {},
    secrets: {},
  };
}

async function bucketOf(
  params: Record<string, unknown>,
): Promise<{ Metadata?: Record<string, unknown> }> {
  const outcome = await objectStorageProvisioner().provision!(request(params));
  return (outcome.fragment.content as {
    resources: Record<string, { Metadata?: Record<string, unknown> }>;
  })
    .resources.Site;
}

Deno.test("aws object storage: development sync rules render as the bucket's metadata", async () => {
  const bucket = await bucketOf({
    contents: "/repo/source/artifacts/packages/site",
    development: { sync: [{ app: "site", path: "/", ignore: ["*.map"] }] },
  });

  assertEquals(bucket.Metadata, {
    [DEVELOPMENT_METADATA]: {
      sync: [{ app: "site", path: "/", ignore: ["*.map"] }],
    },
  });
});

Deno.test("aws object storage: no development block renders no metadata", async () => {
  assertEquals((await bucketOf({})).Metadata, undefined);
});

Deno.test("aws object storage: development sync needs contents to keep current", async () => {
  await assertRejects(
    () => bucketOf({ development: { sync: [{ app: "site", path: "/" }] } }),
    Error,
    `development.sync keeps "contents" current`,
  );
});

Deno.test("aws object storage: a bucket has nothing to restart nor an environment", async () => {
  const contents = "/repo/source/artifacts/packages/site";
  await assertRejects(
    () =>
      bucketOf({
        contents,
        development: { "sync+restart": [{ app: "site", path: "/" }] },
      }),
    Error,
    "a bucket has nothing to restart",
  );
  await assertRejects(
    () => bucketOf({ contents, development: { env: { DEBUG: true } } }),
    Error,
    "a bucket has no environment",
  );
});

async function propertiesOf(
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const outcome = await objectStorageProvisioner().provision!(request(params));
  return (outcome.fragment.content as {
    resources: Record<string, { Properties: Record<string, unknown> }>;
  })
    .resources.Site.Properties;
}

Deno.test("aws object storage: cors renders as the bucket's CORS rules", async () => {
  const properties = await propertiesOf({
    cors: [{
      origins: ["*"],
      methods: ["put", "GET"],
      headers: ["*"],
      exposeHeaders: ["ETag"],
      maxAge: 3600,
    }],
  });

  assertEquals(properties.CorsConfiguration, {
    CorsRules: [{
      AllowedOrigins: ["*"],
      AllowedMethods: ["PUT", "GET"],
      AllowedHeaders: ["*"],
      ExposedHeaders: ["ETag"],
      MaxAge: 3600,
    }],
  });
});

Deno.test("aws object storage: no cors renders no CORS configuration", async () => {
  assertEquals((await propertiesOf({})).CorsConfiguration, undefined);
});

Deno.test("aws object storage: cors needs origins and S3's own methods", async () => {
  await assertRejects(
    () => propertiesOf({ cors: [{ methods: ["GET"] }] }),
    Error,
    "cors[0].origins",
  );
  await assertRejects(
    () => propertiesOf({ cors: [{ origins: ["*"], methods: ["PATCH"] }] }),
    Error,
    "not PATCH",
  );
});
