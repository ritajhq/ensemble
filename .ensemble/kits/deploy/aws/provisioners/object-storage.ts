import * as KitSdk from "@ensemble/kit-sdk";
import { pascalCase } from "../pascal-case.ts";
import { sub } from "../cfn.ts";
import {
  DEVELOPMENT_METADATA,
  type DevelopmentSync,
} from "../development-sync.ts";

/**
 * Fulfills `object-storage` on aws as a plain `AWS::S3::Bucket` — nothing
 * else. `accessKeySecret`/`secretKeySecret` are silently dropped: IAM always
 * mints its own access keys, it can't be handed a caller-chosen pair to
 * import the way Garage's own CLI can on compose (`object-storage.v1`'s own
 * contract comment explains this in full) — a consuming compute is expected
 * to reach this bucket through an attached IAM role/policy instead, which is
 * outside this contract's own surface, same as `init` being outside
 * `relational.v1`'s aws provisioner today.
 *
 * `url` is `dynamic` (declared in `../realization.ts`): the endpoint domain
 * embeds the stack's own deploy region, never known at render time (G3) —
 * `Fn::Sub`'s bare `${AWS::Region}` resolves it at deploy time without
 * needing a declared Sub variable for it.
 */
export function objectStorageProvisioner(): KitSdk.Deploy.Provisioner {
  return {
    // deno-lint-ignore require-await
    matches: async (resource) =>
      resource.category === "storage" &&
      resource.declaration.type === "object-storage",
    // deno-lint-ignore require-await
    describe: async () => "object storage (AWS::S3::Bucket)",
    // deno-lint-ignore require-await
    provision: async (request) => {
      const logicalId = pascalCase(request.name);
      const bucket = request.params.bucket as string;
      const contents = request.params.contents as string | undefined;
      const sync = developmentSync(
        request.params.development,
        contents,
        request.name,
      );
      const cors = corsRules(request.params.cors, request.name);

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            resources: {
              [logicalId]: {
                Type: "AWS::S3::Bucket",
                Properties: {
                  BucketName: bucket,
                  ...(cors ? { CorsConfiguration: { CorsRules: cors } } : {}),
                },
                ...(sync ? { Metadata: { [DEVELOPMENT_METADATA]: sync } } : {}),
              },
            },
          },
        },
        outputs: {
          bucket,
          url: sub(`https://${bucket}.s3.\${AWS::Region}.amazonaws.com`, {}),
        },
        ...(contents
          ? {
            initCommands: [{
              name: `${request.name}-contents`,
              run: syncContents(contents, bucket),
            }],
          }
          : {}),
      };
    },
  };
}

const CORS_METHODS = new Set(["GET", "PUT", "POST", "DELETE", "HEAD"]);

/**
 * `cors` as the bucket's `CorsConfiguration` rules — S3's own model, field
 * for field. `undefined` when there are none.
 */
function corsRules(
  raw: unknown,
  name: string,
): Record<string, unknown>[] | undefined {
  if (raw === undefined) return undefined;
  const rules = raw as readonly Record<string, unknown>[];
  return rules.map((rule, index) => {
    const field = `storage.${name}.cors[${index}]`;
    const origins = stringList(rule.origins, `${field}.origins`, true);
    const methods = stringList(rule.methods, `${field}.methods`, true).map((
      m,
    ) => m.toUpperCase());
    const unknown = methods.filter((m) => !CORS_METHODS.has(m));
    if (unknown.length > 0) {
      throw new Error(
        `${field}.methods: S3 allows ${[...CORS_METHODS].join(", ")}, not ${
          unknown.join(", ")
        }.`,
      );
    }
    if (rule.maxAge !== undefined && !Number.isInteger(rule.maxAge)) {
      throw new Error(`${field}.maxAge must be a whole number of seconds.`);
    }
    const headers = stringList(rule.headers, `${field}.headers`, false);
    const exposed = stringList(
      rule.exposeHeaders,
      `${field}.exposeHeaders`,
      false,
    );
    return {
      AllowedOrigins: origins,
      AllowedMethods: methods,
      ...(headers.length > 0 ? { AllowedHeaders: headers } : {}),
      ...(exposed.length > 0 ? { ExposedHeaders: exposed } : {}),
      ...(rule.maxAge !== undefined ? { MaxAge: rule.maxAge } : {}),
    };
  });
}

function stringList(raw: unknown, field: string, required: boolean): string[] {
  if (raw === undefined && !required) return [];
  if (
    Array.isArray(raw) && raw.length > 0 &&
    raw.every((item) => typeof item === "string")
  ) return raw;
  throw new Error(`${field} must be a non-empty list of strings.`);
}

/**
 * The bucket's `development.sync` rules, as the template metadata `ens
 * develop`'s watch (../watch.ts) reads back to keep `contents` current —
 * `undefined` when there's nothing to sync. A bucket has no process to
 * restart nor environment to extend, so `sync+restart` and `env` are
 * rejected, and syncing needs `contents` to keep current in the first place.
 */
function developmentSync(
  development: unknown,
  contents: string | undefined,
  name: string,
): DevelopmentSync | undefined {
  if (development === undefined) return undefined;
  const block = KitSdk.Deploy.parseDevelopmentBlock(development);
  if (block["sync+restart"].length > 0) {
    throw new Error(
      `storage.${name}: a bucket has nothing to restart — use development.sync.`,
    );
  }
  if (Object.keys(block.env).length > 0) {
    throw new Error(
      `storage.${name}: a bucket has no environment for development.env to add to.`,
    );
  }
  if (block.sync.length === 0) return undefined;
  if (contents === undefined) {
    throw new Error(
      `storage.${name}: development.sync keeps "contents" current, but the bucket declares none.`,
    );
  }
  return {
    sync: block.sync.map((rule) => ({
      app: rule.app,
      path: rule.path,
      ...(rule.ignore.length > 0 ? { ignore: [...rule.ignore] } : {}),
    })),
  };
}

/**
 * `contents` filled in once the bucket exists: the release's files (a local
 * directory, or the `s3://` prefix it was published to) mirrored into the
 * bucket, removing whatever the previous release had that this one doesn't.
 * Plain `aws`, so it lands wherever the environment points the CLI — the same
 * account (or local stand-in) the stack itself was applied to. It waits for
 * the bucket first: under `ens develop` init commands start alongside the
 * watch, which is still deploying the stack.
 */
function syncContents(source: string, bucket: string): string {
  return [
    `aws s3api wait bucket-exists --bucket ${shellQuote(bucket)}`,
    `aws s3 sync ${shellQuote(source)} ${
      shellQuote(`s3://${bucket}`)
    } --delete --only-show-errors`,
  ].join(" && ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
