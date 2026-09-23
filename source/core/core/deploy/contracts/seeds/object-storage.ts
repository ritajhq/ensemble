import { ResourceContract } from "../contract.ts";

/**
 * `object-storage.v1` — an S3-compatible bucket. `bucket` is required: every
 * realization needs a name to create or address, the same "every kit uses
 * it" bar `relational.v1`'s own required params clear.
 *
 * `accessKeySecret`/`secretKeySecret` name declared `secrets` entries
 * supplying static S3 credentials — the same "name a secret, provisioner
 * resolves it" convention `relational.v1`'s `passwordSecret` established,
 * generalized here as a pair since S3-style auth needs both halves. Left
 * optional rather than required (unlike `passwordSecret`) because only one
 * of the two realizations can actually honor them: compose's Garage
 * provisioner imports them as Garage's own static access key (Garage has no
 * IAM of its own to mint one instead); aws's real `AWS::S3::Bucket` has
 * nothing to import a caller-chosen key pair into — IAM always mints its own
 * access keys, it cannot be handed one — so the aws provisioner silently
 * drops both params, same treatment `init` gets on aws's own relational
 * provisioner. A manifest targeting aws only can omit them entirely; one
 * targeting compose needs them, and compose's provisioner throws a clear
 * error at render time if they're missing, rather than the contract
 * rejecting an aws-only manifest that never needed them.
 *
 * Outputs mirror `relational.v1`'s own "expose individually" precedent:
 * `url` is the one portal's manifest already references
 * (`${storage.s3.url}`); `bucket` passes the param through so a future
 * reference can address it without a contract change, same reasoning
 * `relational.v1`'s `database` output already documents.
 */
export const objectStorageV1: ResourceContract = new ResourceContract(
  "storage",
  "object-storage",
  "v1",
  [
    { name: "bucket", required: true, type: "string" },
    { name: "accessKeySecret", required: false, type: "string" },
    { name: "secretKeySecret", required: false, type: "string" },
  ],
  [],
  [],
  ["url", "bucket"],
);
