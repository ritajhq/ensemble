import type { JsonValue } from "./json.ts";

/** Identifies the workload a compute/resource entry belongs to, independent of which target is translating it. */
export interface WorkloadMeta {
  name: string;
  environment: string;
}

/** A file a handler wants written to the deploy output directory (e.g. a rendered compose.yaml fragment, a Kubernetes manifest, a Terraform file). */
export interface GeneratedFile {
  /** Path relative to the deploy run's output directory. */
  path: string;
  content: string;
}

/**
 * What a handler receives. `spec` is already narrowed to the one `Kind` this
 * handler registered for — a function-isolate handler never sees a
 * container spec. `refs` carries every `Reference` the spec declared,
 * already resolved to plain values by the time the handler runs — a handler
 * never resolves references itself.
 */
export interface HandlerInput<TSpec> {
  workload: WorkloadMeta;
  spec: TSpec;
  /** Resolved values for every Reference this spec's reference-capable fields declared, keyed by field path. */
  refs: Record<string, string>;
  /** Target-scoped config a deploy run supplies once (region, account, VPC, ...) — not per-entry. */
  targetConfig: JsonValue;
}

/**
 * What a handler returns. `output` is this entry's own resolved values,
 * addressable by other entries via `${<category>.<name>.<output-key>}` — a
 * compute kind that produces no referenceable output (the common case)
 * returns `{}`.
 */
export interface HandlerResult {
  files?: GeneratedFile[];
  manifests?: JsonValue[];
  output: Record<string, string>;
}

/**
 * The translator contract every deploy kit implements per (target, kind) it
 * supports. One identical shape for both compute and resource kinds — see
 * the taxonomy doc's "one mechanism for both" decision — so a handler for
 * `container-orchestrated` and a handler for `object-storage` are the same
 * TypeScript interface, differing only in `TSpec`.
 */
export interface Handler<TSpec> {
  translate(input: HandlerInput<TSpec>): Promise<HandlerResult> | HandlerResult;
}

/** Type-erased form `Router` stores internally — `Kind` alone doesn't statically narrow `TSpec`, so lookups are cast at the one call site that resolves a handler against its already-known spec type. */
export type AnyHandler = Handler<unknown>;
