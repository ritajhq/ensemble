import * as KitSdk from "@ensemble/kit-sdk";
import { pascalCase } from "../pascal-case.ts";
import { sub } from "../cfn.ts";

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

      return {
        fragment: {
          category: request.category,
          name: request.name,
          content: {
            resources: {
              [logicalId]: {
                Type: "AWS::S3::Bucket",
                Properties: { BucketName: bucket },
              },
            },
          },
        },
        outputs: {
          bucket,
          url: sub(`https://${bucket}.s3.\${AWS::Region}.amazonaws.com`, {}),
        },
      };
    },
  };
}
