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
 * `contents`, when given, is a `${release.<name>}` reference whose files the
 * bucket holds once it's up — a static site's build, say — synced (stale
 * objects removed) after every apply. A kit without a way to fill a bucket
 * rejects it rather than leaving the bucket silently empty.
 *
 * `cors` lists the browser origins allowed to reach the bucket directly — a
 * page uploading through a presigned URL, say — one S3 CORS rule per entry:
 * `origins`, `methods`, and optionally `headers` (request headers allowed),
 * `exposeHeaders` and `maxAge` (seconds). It's the S3 API's own model
 * (`PutBucketCors`), so any S3-compatible store can honor it; a kit that
 * can't rejects it rather than leaving browsers blocked.
 *
 * `development` is the same developer-owned block compute resources take
 * (`../../development.ts`), checked here only as an object. On a bucket it
 * means "while `ens develop` runs, keep `contents` current with these apps'
 * build output": each `sync` rule's `app` is re-uploaded under its `path`
 * (a key prefix) whenever its build changes. A bucket has no process to
 * restart or environment to extend, so a kit honoring the block rejects
 * `sync+restart` and `env`; a kit that can't fill a bucket from `contents`
 * rejects `development` for the same reason it rejects `contents`.
 *
 * Outputs mirror `relational.v1`'s own "expose individually" precedent:
 * `url` is the one portal's manifest already references
 * (`${storage.s3.url}`) — the bucket's S3 API as the stack's own compute
 * reaches it; `bucket` passes the param through so a future reference can
 * address it without a contract change, same reasoning `relational.v1`'s
 * `database` output already documents. `publicUrl` is the bucket's S3 API as
 * a browser reaches it — what a presigned URL handed to a page has to point
 * at, and not always `url`: a local stand-in serves the stack's network and
 * the developer's machine at different addresses.
 */
export const objectStorageV1: ResourceContract = new ResourceContract(
  "storage",
  "object-storage",
  "v1",
  [
    { name: "bucket", required: true, type: "string" },
    { name: "accessKeySecret", required: false, type: "string" },
    { name: "secretKeySecret", required: false, type: "string" },
    { name: "contents", required: false, type: "string" },
    { name: "cors", required: false, type: "array" },
    { name: "development", required: false, type: "object" },
  ],
  [],
  [],
  ["url", "publicUrl", "bucket"],
);
