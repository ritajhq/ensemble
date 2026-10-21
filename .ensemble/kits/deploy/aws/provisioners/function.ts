import * as KitSdk from "@ensemble/kit-sdk";
import { pascalCase } from "../pascal-case.ts";
import { getAtt, join, ref } from "../cfn.ts";
import {
  DEVELOPMENT_METADATA,
  type DevelopmentSync,
} from "../development-sync.ts";
import { HANDLER } from "../function-adapter.ts";

const DEFAULT_RUNTIME = "nodejs24.x";
const TIMEOUT_SECONDS = 15;
const BASIC_EXECUTION_POLICY =
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";
/** Object access in a bucket the function lists in `buckets` — listing is granted on the bucket itself. */
const OBJECT_ACTIONS = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"];

/** A bucket's ARN (plus `suffix`) from its name: S3 ARNs carry no region or account. */
function bucketArn(bucket: unknown, suffix: string): unknown {
  return join(["arn:", ref("AWS::Partition"), ":s3:::", bucket, suffix]);
}

/** A table's ARN (plus `suffix`) from its name, in the stack's own region and account. */
function tableArn(table: unknown, suffix: string): unknown {
  return join([
    "arn:",
    ref("AWS::Partition"),
    ":dynamodb:",
    ref("AWS::Region"),
    ":",
    ref("AWS::AccountId"),
    ":table/",
    table,
    suffix,
  ]);
}

const TABLE_ACTIONS = [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:Query",
  "dynamodb:Scan",
  "dynamodb:BatchGetItem",
  "dynamodb:BatchWriteItem",
  "dynamodb:TransactGetItems",
  "dynamodb:TransactWriteItems",
  "dynamodb:ConditionCheckItem",
];

/**
 * Where a function's bundle comes from, in CloudFormation's own terms: a
 * published `s3://bucket/key` becomes `S3Bucket`/`S3Key`; anything else is a
 * local file `aws cloudformation package` uploads before the deploy (see
 * ../apply.ts) — so the same render applies whether the release was packed
 * locally or published.
 */
function codeOf(location: string): unknown {
  const published = /^s3:\/\/([^/]+)\/(.+)$/.exec(location);
  if (!published) return location;
  return { S3Bucket: published[1], S3Key: published[2] };
}

/**
 * The function's `development.sync` rules, as the template metadata
 * `ens develop`'s watch (../watch.ts) reads back — both groups alike: every
 * code update starts fresh execution environments, so there's no sync that
 * leaves the old code running. `undefined` when there's nothing to sync.
 * Rendered whatever the mode, like compose's `develop` block: CloudFormation
 * ignores metadata, and only a watch acts on it.
 */
function developmentSync(development: unknown): DevelopmentSync | undefined {
  if (development === undefined) return undefined;
  const block = KitSdk.Deploy.parseDevelopmentBlock(development);
  const rules = [...block.sync, ...block["sync+restart"]];
  if (rules.length === 0) return undefined;
  return {
    sync: rules.map((rule) => ({
      app: rule.app,
      path: rule.path,
      ...(rule.ignore.length > 0 ? { ignore: [...rule.ignore] } : {}),
    })),
  };
}

/**
 * The function's environment plus its `development.env` additions, under `ens
 * develop` only. Naming a variable `env` already sets is an error, not an
 * override: development may run with more than production, never with
 * something different.
 */
function environmentOf(
  request: KitSdk.Deploy.ResolvedRequest,
): Record<string, unknown> | undefined {
  const env = request.params.env as Record<string, unknown> | undefined;
  if (request.params.development === undefined) return env;
  const additions =
    KitSdk.Deploy.parseDevelopmentBlock(request.params.development).env;
  const replaced = Object.keys(additions).filter((name) => name in (env ?? {}));
  if (replaced.length > 0) {
    throw new Error(
      `compute.${request.name}: development.env may only add variables, but ${
        replaced.join(", ")
      } already set by env.`,
    );
  }
  if (request.mode !== "development" || Object.keys(additions).length === 0) {
    return env;
  }
  return { ...env, ...additions };
}

/**
 * Fulfills `function` on aws as an `AWS::Lambda::Function` with its own
 * execution role: CloudWatch Logs (the basic execution policy) plus item-level
 * access to exactly the `key-value` tables it lists in `tables` — and their
 * indexes — and object access to the buckets it lists in `buckets`, nothing
 * broader — each table granted by its name, the ARN being this kit's to
 * derive. Its handler is the one the kit adds to the bundle when it deploys
 * it (`../function-adapter.ts`), adapting Lambda's invocation to the
 * bundle's own `aws.js`. HTTP exposure isn't here: a `gateway` route
 * naming this function as its target brings its API Gateway with it.
 */
export function functionProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "compute" &&
      resource.declaration.type === "function",
    // deno-lint-ignore require-await
    describe: async () => "function (AWS::Lambda::Function)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const logicalId = pascalCase(request.name);
      const roleId = `${logicalId}Role`;
      const tables =
        (request.params.tables as readonly unknown[] | undefined) ?? [];
      const buckets =
        (request.params.buckets as readonly unknown[] | undefined) ?? [];
      const env = environmentOf(request);
      const sync = developmentSync(request.params.development);

      const role = {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [{
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            }],
          },
          ManagedPolicyArns: [BASIC_EXECUTION_POLICY],
          ...(tables.length + buckets.length > 0
            ? {
              Policies: [
                ...(tables.length > 0
                  ? [{
                    PolicyName: "tables",
                    PolicyDocument: {
                      Version: "2012-10-17",
                      Statement: [{
                        Effect: "Allow",
                        Action: TABLE_ACTIONS,
                        Resource: tables.flatMap((
                          table,
                        ) => [
                          tableArn(table, ""),
                          tableArn(table, "/index/*"),
                        ]),
                      }],
                    },
                  }]
                  : []),
                ...(buckets.length > 0
                  ? [{
                    PolicyName: "buckets",
                    PolicyDocument: {
                      Version: "2012-10-17",
                      Statement: [
                        {
                          Effect: "Allow",
                          Action: OBJECT_ACTIONS,
                          Resource: buckets.map((bucket) =>
                            bucketArn(bucket, "/*")
                          ),
                        },
                        {
                          Effect: "Allow",
                          Action: ["s3:ListBucket"],
                          Resource: buckets.map((bucket) =>
                            bucketArn(bucket, "")
                          ),
                        },
                      ],
                    },
                  }]
                  : []),
              ],
            }
            : {}),
        },
      };

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            resources: {
              [roleId]: role,
              [logicalId]: {
                Type: "AWS::Lambda::Function",
                ...(sync ? { Metadata: { [DEVELOPMENT_METADATA]: sync } } : {}),
                Properties: {
                  Runtime: (request.params.runtime as string | undefined) ??
                    DEFAULT_RUNTIME,
                  Handler: HANDLER,
                  Role: getAtt(roleId, "Arn"),
                  Code: codeOf(String(request.params.code)),
                  Timeout: TIMEOUT_SECONDS,
                  ...(env ? { Environment: { Variables: env } } : {}),
                },
              },
            },
          },
        },
        outputs: { name: ref(logicalId) },
      };
    },
  };
}
