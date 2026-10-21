import * as KitSdk from "@ensemble/kit-sdk";
import { pascalCase } from "../pascal-case.ts";

/**
 * Fulfills `key-value` on aws as an `AWS::DynamoDB::Table` named after the
 * resource itself — so its `name` output is known at render time, and the
 * same manifest names the same table everywhere it's deployed, and a
 * function is granted it by that name (`./function.ts` derives the ARN).
 * DynamoDB's
 * own specifics are this kit's realization, never the manifest's: both key
 * attributes are strings (`S`), and capacity is on-demand
 * (`PAY_PER_REQUEST`), which needs no sizing and costs nothing idle.
 */
export function keyValueProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) => resource.declaration.type === "key-value",
    // deno-lint-ignore require-await
    describe: async () => "key-value (AWS::DynamoDB::Table)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const logicalId = pascalCase(request.name);
      const keySchema = KitSdk.Deploy.parseKeySchema(request.params.keySchema);
      const keys = [
        { AttributeName: keySchema.partition, KeyType: "HASH" },
        ...(keySchema.sort
          ? [{ AttributeName: keySchema.sort, KeyType: "RANGE" }]
          : []),
      ];

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            resources: {
              [logicalId]: {
                Type: "AWS::DynamoDB::Table",
                Properties: {
                  TableName: request.name,
                  BillingMode: "PAY_PER_REQUEST",
                  AttributeDefinitions: keys.map((key) => ({
                    AttributeName: key.AttributeName,
                    AttributeType: "S",
                  })),
                  KeySchema: keys,
                },
              },
            },
          },
        },
        outputs: { name: request.name },
      };
    },
  };
}
