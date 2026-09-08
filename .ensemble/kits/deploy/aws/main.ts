import * as KitSdk from "@ensemble/kit-sdk";
import { $ } from "@david/dax";

// A deploy kit for AWS data resources, driven by shelling to the `aws` CLI.
// Scope today: DynamoDB tables, modeled as `databases` entries of kind
// `key-value` (the aws kit reads them as DynamoDB tables; a local kit like
// compose reads the same kind as a KV server). Mode-aware target:
//
//   development → a local emulator (floci): `--endpoint-url <endpoint>`.
//   production  → real AWS: no endpoint; region + credentials come from the
//                 ambient AWS environment (the caller's responsibility, same
//                 explicit-wiring principle as the docker publish kit).
//
// The kit invents no AWS convention beyond this: attribute types, billing mode,
// and secondary indexes come from each entry's `overrides.aws`, and the dev
// endpoint from `overrides.aws.endpoint` — read verbatim.

interface AwsOverrides {
  /** Local emulator endpoint used in development (e.g. floci's http://localhost:4566). Ignored in production. */
  endpoint?: string;
  /** DynamoDB billing mode. Defaults to PAY_PER_REQUEST. */
  billingMode?: string;
  /** Attribute type for the key attributes (S/N/B). Defaults to S. */
  keyType?: string;
}

function awsOverrides(entry: KitSdk.Deploy.KeyValue): AwsOverrides {
  const raw = entry.overrides?.aws;
  return (raw && typeof raw === "object" ? raw : {}) as AwsOverrides;
}

/** The `--endpoint-url` arg for a run, or [] — an emulator endpoint in development, nothing (real AWS) in production. */
function endpointArgs(entry: KitSdk.Deploy.KeyValue, development: boolean): string[] {
  if (!development) return [];
  const endpoint = awsOverrides(entry).endpoint;
  if (!endpoint) {
    throw new Error(
      `key-value "table" has no overrides.aws.endpoint for a development deploy — set it to the local emulator's endpoint (e.g. http://localhost:4566), or run in production mode to target real AWS.`,
    );
  }
  return ["--endpoint-url", endpoint];
}

/** Every `key-value` database entry in the workload — the tables this kit owns. */
function keyValueTables(
  workload: KitSdk.Deploy.Workload,
): [string, KitSdk.Deploy.KeyValue][] {
  return Object.entries(workload.databases ?? {})
    .filter(([, spec]) => spec.type === "key-value")
    .map(([name, spec]) => [name, spec as KitSdk.Deploy.KeyValue]);
}

async function tableExists(
  table: string,
  endpoint: string[],
): Promise<boolean> {
  const result = await $`aws dynamodb describe-table --table-name ${table} ${endpoint}`
    .quiet().noThrow();
  return result.code === 0;
}

async function createTable(
  name: string,
  spec: KitSdk.Deploy.KeyValue,
  development: boolean,
): Promise<void> {
  if (!spec.keySchema) {
    throw new Error(
      `key-value "${name}" has no keySchema — the aws kit needs at least a partition key to create its DynamoDB table.`,
    );
  }
  const endpoint = endpointArgs(spec, development);
  // Idempotent: a table that already exists is a no-op (creds/schema live in
  // the emulator's or AWS's own state and outlive a redeploy).
  if (await tableExists(name, endpoint)) return;

  const overrides = awsOverrides(spec);
  const keyType = overrides.keyType ?? "S";
  const billingMode = overrides.billingMode ?? "PAY_PER_REQUEST";

  const { partition, sort } = spec.keySchema;
  const attributeDefs = [`AttributeName=${partition},AttributeType=${keyType}`];
  const keySchema = [`AttributeName=${partition},KeyType=HASH`];
  if (sort) {
    attributeDefs.push(`AttributeName=${sort},AttributeType=${keyType}`);
    keySchema.push(`AttributeName=${sort},KeyType=RANGE`);
  }

  const result = await $`aws dynamodb create-table \
    --table-name ${name} \
    --attribute-definitions ${attributeDefs} \
    --key-schema ${keySchema} \
    --billing-mode ${billingMode} ${endpoint}`.noThrow();
  if (result.code !== 0) {
    throw new Error(`aws dynamodb create-table failed for "${name}" (exit ${result.code})`);
  }
}

const kit = new KitSdk.Deploy.Kit();

kit.Configure(
  async (workload, _batches, options, _ctx) => {
    for (const [name, spec] of keyValueTables(workload)) {
      await createTable(name, spec, options.development);
    }
  },
  async (workload, _batches, options, _ctx) => {
    // Only tear tables down in development (against the emulator) — never
    // casually delete a real production table.
    if (!options.development) return;
    for (const [name, spec] of keyValueTables(workload)) {
      const endpoint = endpointArgs(spec, true);
      await $`aws dynamodb delete-table --table-name ${name} ${endpoint}`.noThrow();
    }
  },
);

export default kit;
