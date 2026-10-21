import type { Plan, Route } from "./plan.ts";

/** The Workers runtime version every Worker is pinned to, so a deploy's behaviour doesn't drift with Cloudflare's. */
export const COMPATIBILITY_DATE = "2026-09-01";
/** The key pair the local runtime's S3 stand-in takes — local only, so nothing to keep secret. */
export const LOCAL_CREDENTIALS = {
  accessKeyId: "ensemble-local",
  secretAccessKey: "ensemble-local-secret",
} as const;
/** Where a Worker granted buckets finds the R2 key pair to sign S3 requests with. */
export const CREDENTIAL_VARS = {
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
} as const;
const CATCH_ALL = new Set(["/*", "/"]);

/** Where each Worker's code is on disk: a function's `main.js`, the gateway runtime, a site's files. */
export interface Paths {
  workerMain(worker: string): string;
  readonly gatewayMain: string;
  assets(bucket: string): string;
}

/** What only Cloudflare can tell: each D1 database's id (anything will do locally). */
export type DatabaseIds = Readonly<Record<string, string>>;

/**
 * Each Worker's wrangler configuration, from the plan: every function's
 * Worker and every gateway's, named `<deployment>-<resource>` — Worker names
 * share one namespace across the whole account, as stack names do across an
 * AWS one. Only gateways answer on the Internet (workers.dev); a function's
 * Worker is reached through its gateway's service binding alone.
 */
export class WranglerConfigs {
  constructor(
    private readonly plan: Plan,
    private readonly deployment: string,
  ) {
    this.validate();
  }

  workerName(resource: string): string {
    return `${this.deployment}-${resource}`.toLowerCase().replace(
      /[^a-z0-9-]+/g,
      "-",
    ).slice(0, 63);
  }

  databaseName(table: string): string {
    return this.workerName(table);
  }

  /** Function Workers first: a gateway's service bindings need theirs deployed. */
  all(
    paths: Paths,
    ids: DatabaseIds,
  ): { resource: string; config: Record<string, unknown> }[] {
    return [
      ...Object.keys(this.plan.workers).map((resource) => ({
        resource,
        config: this.worker(resource, paths, ids),
      })),
      ...Object.keys(this.plan.gateways).map((resource) => ({
        resource,
        config: this.gateway(resource, paths),
      })),
    ];
  }

  worker(
    resource: string,
    paths: Paths,
    ids: DatabaseIds,
  ): Record<string, unknown> {
    const worker = this.plan.workers[resource]!;
    const local = this.plan.target.kind === "local";
    return {
      name: this.workerName(resource),
      main: paths.workerMain(resource),
      compatibility_date: COMPATIBILITY_DATE,
      no_bundle: true,
      workers_dev: false,
      preview_urls: false,
      vars: {
        ...worker.env,
        ...(local && worker.buckets.length > 0
          ? {
            [CREDENTIAL_VARS.accessKeyId]: LOCAL_CREDENTIALS.accessKeyId,
            [CREDENTIAL_VARS.secretAccessKey]:
              LOCAL_CREDENTIALS.secretAccessKey,
          }
          : {}),
      },
      ...(worker.tables.length > 0
        ? {
          d1_databases: worker.tables.map((table) => ({
            binding: table,
            database_name: this.databaseName(table),
            database_id: ids[table] ?? missing(`a D1 id for ${table}`),
          })),
        }
        : {}),
      ...(worker.buckets.length > 0
        ? {
          r2_buckets: worker.buckets.map((bucket) =>
            this.r2Binding(bucket, bucket)
          ),
        }
        : {}),
    };
  }

  gateway(resource: string, paths: Paths): Record<string, unknown> {
    const routes = this.ordered(this.plan.gateways[resource]!.routes);
    const services = [
      ...new Set(
        routes.flatMap((
          r,
        ) => ("service" in r.target ? [r.target.service] : [])),
      ),
    ];
    const storages = [
      ...new Set(
        routes.flatMap((
          r,
        ) => ("storage" in r.target ? [r.target.storage] : [])),
      ),
    ];
    const buckets = storages.filter((name) =>
      !this.plan.buckets[name]!.contents
    );
    const site = storages.find((name) => this.plan.buckets[name]!.contents);
    return {
      name: this.workerName(resource),
      main: paths.gatewayMain,
      compatibility_date: COMPATIBILITY_DATE,
      no_bundle: true,
      workers_dev: true,
      preview_urls: false,
      vars: {
        ENSEMBLE_ROUTES: JSON.stringify(
          routes.map((route) => this.routed(route)),
        ),
      },
      ...(services.length > 0
        ? {
          services: services.map((name) => ({
            binding: serviceBinding(name),
            service: this.workerName(name),
          })),
        }
        : {}),
      ...(buckets.length > 0
        ? {
          r2_buckets: buckets.map((name) =>
            this.r2Binding(bucketBinding(name), this.plan.buckets[name]!.bucket)
          ),
        }
        : {}),
      ...(site
        ? {
          assets: {
            directory: paths.assets(site),
            binding: "ASSETS",
            not_found_handling: "single-page-application",
            run_worker_first: true,
          },
        }
        : {}),
    };
  }

  /** Exact paths and prefixes in the order declared, then the catch-all. */
  private ordered(routes: readonly Route[]): Route[] {
    return [
      ...routes.filter((r) => !CATCH_ALL.has(r.path)),
      ...routes.filter((r) => CATCH_ALL.has(r.path)),
    ];
  }

  private routed(
    route: Route,
  ): { path: string; kind: string; binding: string } {
    if ("service" in route.target) {
      return {
        path: route.path,
        kind: "service",
        binding: serviceBinding(route.target.service),
      };
    }
    const name = route.target.storage;
    if (this.plan.buckets[name]!.contents) {
      return { path: route.path, kind: "assets", binding: "ASSETS" };
    }
    return { path: route.path, kind: "bucket", binding: bucketBinding(name) };
  }

  private r2Binding(binding: string, bucket: string): Record<string, unknown> {
    return {
      binding,
      bucket_name: bucket,
      ...(this.plan.target.kind === "local"
        ? {
          local_dev: { experimental_s3_credentials: { ...LOCAL_CREDENTIALS } },
        }
        : {}),
    };
  }

  /** What the plan's resources ask of each other, checked before anything is created. */
  private validate(): void {
    const byBucket = new Map(
      Object.values(this.plan.buckets).map((b) => [b.bucket, b]),
    );
    for (const [name, worker] of Object.entries(this.plan.workers)) {
      for (const table of worker.tables) {
        if (!this.plan.databases[table]) {
          throw new Error(
            `compute.${name}: no key-value table named ${table} to grant.`,
          );
        }
      }
      for (const bucket of worker.buckets) {
        const found = byBucket.get(bucket);
        if (!found) {
          throw new Error(
            `compute.${name}: no bucket named ${bucket} to grant.`,
          );
        }
        if (found.contents) {
          throw new Error(
            `compute.${name}: ${bucket} holds a site's files, which the cloudflare kit serves as a gateway's assets rather than keeping in R2.`,
          );
        }
      }
    }
    const served = new Set<string>();
    for (const [name, gateway] of Object.entries(this.plan.gateways)) {
      const sites = new Set<string>();
      for (const route of gateway.routes) {
        if (
          "service" in route.target && !this.plan.workers[route.target.service]
        ) {
          throw new Error(
            `gateway ${name}: ${route.target.service} isn't a function.`,
          );
        }
        if ("storage" in route.target) {
          const bucket = this.plan.buckets[route.target.storage];
          if (!bucket) {
            throw new Error(
              `gateway ${name}: ${route.target.storage} isn't a bucket.`,
            );
          }
          if (bucket.contents) sites.add(route.target.storage);
          served.add(route.target.storage);
        }
      }
      if (sites.size > 1) {
        throw new Error(
          `gateway ${name}: a Worker serves one site's files as its assets, not ${
            [...sites].join(" and ")
          }.`,
        );
      }
    }
    for (const [name, bucket] of Object.entries(this.plan.buckets)) {
      if (bucket.contents && !served.has(name)) {
        throw new Error(
          `storage.${name}: on cloudflare a site's files are served by a gateway — route one to it.`,
        );
      }
    }
  }
}

export function serviceBinding(resource: string): string {
  return `SERVICE_${resource.replace(/[^A-Za-z0-9]+/g, "_")}`;
}

export function bucketBinding(resource: string): string {
  return `BUCKET_${resource.replace(/[^A-Za-z0-9]+/g, "_")}`;
}

function missing(what: string): never {
  throw new Error(`Missing ${what}.`);
}
