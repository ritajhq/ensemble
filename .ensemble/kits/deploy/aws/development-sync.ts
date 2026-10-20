/**
 * Where a function's or a bucket's `development.sync` rules live in the
 * rendered template: the `AWS::Lambda::Function` or `AWS::S3::Bucket`
 * resource's own `Metadata`, under this key.
 * CloudFormation stores metadata without acting on it; only `ens develop`'s
 * watch (./watch.ts) reads it back.
 */
export const DEVELOPMENT_METADATA = "Ensemble::Development";

/** One sync rule: `app`'s build output (`source/artifacts/<app>`) lands at `path` inside the function's package (or under that key prefix in a bucket), leaving out what `ignore` matches. */
export interface SyncRule {
  readonly app: string;
  readonly path: string;
  readonly ignore?: readonly string[];
}

/** A function's development metadata. */
export interface DevelopmentSync {
  readonly sync: readonly SyncRule[];
}
