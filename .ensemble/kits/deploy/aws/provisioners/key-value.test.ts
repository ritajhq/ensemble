import { assertEquals, assertRejects } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { keyValueProvisioner } from "./key-value.ts";

function request(keySchema: unknown): KitSdk.Deploy.ResolvedRequest {
  return {
    category: "databases",
    name: "experiences",
    type: "key-value",
    params: { keySchema },
    values: {},
    secrets: {},
  };
}

Deno.test("aws key-value: a partition and sort key render as an on-demand DynamoDB table named after the resource", async () => {
  const outcome = await keyValueProvisioner().provision!(
    request({ partition: "PK", sort: "SK" }),
  );

  assertEquals(outcome.fragment.content, {
    resources: {
      Experiences: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "experiences",
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" },
          ],
        },
      },
    },
  });
  assertEquals(outcome.outputs, {
    name: "experiences",
  });
});

Deno.test("aws key-value: a partition key alone renders no sort key", async () => {
  const outcome = await keyValueProvisioner().provision!(
    request({ partition: "id" }),
  );
  const table = (outcome.fragment.content as {
    resources: Record<string, { Properties: Record<string, unknown> }>;
  })
    .resources.Experiences.Properties;

  assertEquals(table.KeySchema, [{ AttributeName: "id", KeyType: "HASH" }]);
  assertEquals(table.AttributeDefinitions, [{
    AttributeName: "id",
    AttributeType: "S",
  }]);
});

Deno.test("aws key-value: an invalid keySchema is rejected naming the problem", async () => {
  await assertRejects(
    () => keyValueProvisioner().provision!(request({ sort: "SK" })),
    KitSdk.Deploy.KeySchemaError,
    `"partition"`,
  );
});
