import type { SyncRule } from "./development-sync.ts";

/**
 * What the cloudflare kit renders a deployment into (`plan.json`): every
 * resource as Cloudflare will hold it, by the manifest's own names, with
 * nothing yet allocated — the apply (`./apply.ts`) creates what's missing and
 * writes each Worker's wrangler configuration from it, and the watch
 * (`./watch.ts`) runs the same Workers locally. Cloudflare has no template
 * engine to hand this to, so the plan is the kit's own.
 */
export interface Plan {
  /** Where it all runs: Cloudflare itself, or the Workers runtime on this machine (under `ens develop` only). */
  readonly target: Target;
  readonly workers: Readonly<Record<string, Worker>>;
  readonly databases: Readonly<Record<string, Database>>;
  readonly buckets: Readonly<Record<string, Bucket>>;
  readonly gateways: Readonly<Record<string, Gateway>>;
}

export type Target =
  | { readonly kind: "remote"; readonly accountId: string }
  | { readonly kind: "local"; readonly port: number };

/** A `function`, as a Worker running its bundle's `main.js`. */
export interface Worker {
  /** The bundle: a packed zip, or a published `s3://` location. */
  readonly code: string;
  readonly env: Readonly<Record<string, string>>;
  /** `key-value` tables it's granted, by name — each bound under that name. */
  readonly tables: readonly string[];
  /** Buckets it's granted, by bucket name — each bound under that name. */
  readonly buckets: readonly string[];
  readonly sync?: readonly SyncRule[];
}

/** A `key-value` table, as a D1 database holding one `items` table keyed like it. */
export interface Database {
  readonly partition: string;
  readonly sort?: string;
}

/** An `object-storage` bucket: an R2 bucket — or, when it has `contents`, the static assets of the gateway that serves it. */
export interface Bucket {
  readonly bucket: string;
  readonly contents?: string;
  readonly cors?: readonly CorsRule[];
  readonly sync?: readonly SyncRule[];
}

export interface CorsRule {
  readonly origins: readonly string[];
  readonly methods: readonly string[];
  readonly headers?: readonly string[];
  readonly exposeHeaders?: readonly string[];
  readonly maxAge?: number;
}

/** A `gateway`, as a Worker routing by path to Workers, buckets and its own assets. */
export interface Gateway {
  readonly routes: readonly Route[];
}

export interface Route {
  readonly path: string;
  readonly target: { readonly service: string } | { readonly storage: string };
}

/** One provisioner's share of the plan — its fragment's content. */
export type Fragment = Partial<Omit<Plan, "target">>;
