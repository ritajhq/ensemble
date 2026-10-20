/**
 * Where a gateway's routes live in the rendered template: the
 * `AWS::CloudFront::Distribution`'s own `Metadata`, under this key — one
 * entry per route target, with every path routed to it, in declaration
 * order. CloudFormation stores it without acting on it; `ens develop`'s watch
 * (./watch.ts) reads it back to list where each target answers once the
 * stack is up, which only the deployed distribution's domain can tell.
 */
export const ROUTES_METADATA = "Ensemble::Routes";

/** A route target (a function or a bucket, by its resource name) and the paths that reach it. */
export interface RoutedTarget {
  readonly service: string;
  readonly paths: readonly string[];
}
