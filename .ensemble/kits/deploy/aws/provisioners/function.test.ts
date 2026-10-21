import { assertEquals, assertRejects } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { functionProvisioner } from "./function.ts";
import { DEVELOPMENT_METADATA } from "../development-sync.ts";

function request(
  params: Record<string, unknown>,
  mode?: KitSdk.Deploy.Mode,
): KitSdk.Deploy.ResolvedRequest {
  return {
    category: "compute",
    name: "api",
    type: "function",
    params: { code: "/repo/source/artifacts/packages/api.zip", ...params },
    values: {},
    secrets: {},
    ...(mode ? { mode } : {}),
  };
}

async function lambdaOf(
  params: Record<string, unknown>,
  mode?: KitSdk.Deploy.Mode,
): Promise<
  { Metadata?: Record<string, unknown>; Properties: Record<string, unknown> }
> {
  const outcome = await functionProvisioner().provision!(request(params, mode));
  return (outcome.fragment.content as {
    resources: Record<
      string,
      {
        Metadata?: Record<string, unknown>;
        Properties: Record<string, unknown>;
      }
    >;
  }).resources.Api;
}

Deno.test("aws function: development sync rules of either group render as the function's metadata", async () => {
  const lambda = await lambdaOf({
    development: {
      sync: [{ app: "server", path: "/" }],
      "sync+restart": [{ app: "worker", path: "lib", ignore: ["*.map"] }],
    },
  });

  assertEquals(lambda.Metadata, {
    [DEVELOPMENT_METADATA]: {
      sync: [
        { app: "server", path: "/" },
        { app: "worker", path: "lib", ignore: ["*.map"] },
      ],
    },
  });
});

Deno.test("aws function: no development block renders no metadata", async () => {
  const lambda = await lambdaOf({});

  assertEquals(lambda.Metadata, undefined);
});

Deno.test("aws function: development.env adds variables under ens develop only", async () => {
  const params = {
    env: { TABLE: "experiences" },
    development: { env: { DEBUG: true } },
  };

  assertEquals(
    ((await lambdaOf(params, "development")).Properties.Environment as {
      Variables: unknown;
    }).Variables,
    { TABLE: "experiences", DEBUG: "true" },
  );
  assertEquals(
    ((await lambdaOf(params, "deployment")).Properties.Environment as {
      Variables: unknown;
    }).Variables,
    { TABLE: "experiences" },
  );
});

Deno.test("aws function: development.env naming a variable env already sets is rejected", async () => {
  await assertRejects(
    () =>
      lambdaOf({
        env: { TABLE: "experiences" },
        development: { env: { TABLE: "other" } },
      }),
    Error,
    "development.env may only add variables",
  );
});

Deno.test("aws function: buckets grant object access and listing on exactly those buckets", async () => {
  const outcome = await functionProvisioner().provision!(
    request({ buckets: ["my-files"] }),
  );
  const role = (outcome.fragment.content as {
    resources: Record<
      string,
      {
        Properties: {
          Policies?: { PolicyName: string; PolicyDocument: unknown }[];
        };
      }
    >;
  }).resources.ApiRole;
  const arn = (suffix: string) => ({
    "Fn::Join": ["", [
      "arn:",
      { Ref: "AWS::Partition" },
      ":s3:::",
      "my-files",
      suffix,
    ]],
  });

  assertEquals(role.Properties.Policies, [{
    PolicyName: "buckets",
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          Resource: [arn("/*")],
        },
        { Effect: "Allow", Action: ["s3:ListBucket"], Resource: [arn("")] },
      ],
    },
  }]);
});

Deno.test("aws function: tables grant item access to those tables and their indexes, by name", async () => {
  const outcome = await functionProvisioner().provision!(
    request({ tables: ["experiences"] }),
  );
  const role = (outcome.fragment.content as {
    resources: Record<
      string,
      {
        Properties: {
          Policies?: {
            PolicyName: string;
            PolicyDocument: { Statement: { Resource: unknown }[] };
          }[];
        };
      }
    >;
  }).resources.ApiRole;
  const arn = (suffix: string) => ({
    "Fn::Join": ["", [
      "arn:",
      { Ref: "AWS::Partition" },
      ":dynamodb:",
      { Ref: "AWS::Region" },
      ":",
      { Ref: "AWS::AccountId" },
      ":table/",
      "experiences",
      suffix,
    ]],
  });

  assertEquals(
    role.Properties.Policies?.[0]?.PolicyDocument.Statement[0]?.Resource,
    [arn(""), arn("/index/*")],
  );
});

Deno.test("aws function: runs through the handler the kit adds to its bundle", async () => {
  assertEquals(
    (await lambdaOf({})).Properties.Handler,
    "ensemble-lambda.handler",
  );
});
