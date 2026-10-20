import { dirname, join } from "@std/path";
import type { Plan } from "./plan.ts";
import { routeLines, workersDevUrl } from "./route-listing.ts";
import { itemsTable } from "./schema.ts";
import type { Workspace } from "./workspace.ts";
import type { Wrangler } from "./wrangler.ts";
import {
  CREDENTIAL_VARS,
  type DatabaseIds,
  type Paths,
  type WranglerConfigs,
} from "./wrangler-config.ts";

/** Where a deploy finds the R2 key pair Workers granted buckets sign with — an R2 API token's, which R2 mints and the kit can't. */
export const R2_ACCESS_KEY_ID = "CLOUDFLARE_R2_ACCESS_KEY_ID";
export const R2_SECRET_ACCESS_KEY = "CLOUDFLARE_R2_SECRET_ACCESS_KEY";

/** Which Workers run what: from packed (or published) releases, or straight from their apps' build output under `ens develop`. */
export type Source = "releases" | "builds";

/**
 * A plan brought about on Cloudflare: what's missing created, every Worker
 * deployed — databases and buckets before the Workers bound to them, a
 * gateway after the Workers it routes to.
 */
export class Deployment {
  constructor(
    private readonly plan: Plan,
    private readonly configs: WranglerConfigs,
    private readonly workspace: Workspace,
    private readonly wrangler: Wrangler,
  ) {}

  /** Creates what's missing and deploys every Worker, resolving to the `Routes:` listing. */
  async apply(source: Source): Promise<string[]> {
    const ids = await this.databases();
    const configs = await this.write(await this.paths(source), ids);
    await this.schemas(configs);
    await this.buckets();
    const secrets = await this.secretsFile();
    try {
      const urls = new Map<string, string>();
      for (const { resource, path } of configs) {
        const report = await this.wrangler.deploy(
          path,
          this.needsCredentials(resource) ? secrets : undefined,
        );
        const url = workersDevUrl(report);
        if (url) urls.set(resource, url);
      }
      return routeLines(
        Object.entries(this.plan.gateways).map(([name, gateway]) => ({
          gateway,
          url: urls.get(name) ?? "(not on workers.dev)",
        })),
      );
    } finally {
      if (secrets) await Deno.remove(dirname(secrets), { recursive: true });
    }
  }

  /** Redeploys the Workers `resources` names (a rebuilt function, the gateway serving a rebuilt site). */
  async redeploy(
    resources: ReadonlySet<string>,
    source: Source,
  ): Promise<void> {
    const ids = await this.wrangler.databases().then((all) =>
      this.idsFrom(all)
    );
    const secrets = await this.secretsFile();
    try {
      for (
        const { resource, path } of await this.write(
          await this.paths(source),
          ids,
        )
      ) {
        if (!resources.has(resource)) continue;
        await this.wrangler.deploy(
          path,
          this.needsCredentials(resource) ? secrets : undefined,
        );
      }
    } finally {
      if (secrets) await Deno.remove(dirname(secrets), { recursive: true });
    }
  }

  /** Every Worker's configuration written, in deploy order. */
  async write(
    paths: Paths,
    ids: DatabaseIds,
  ): Promise<{ resource: string; path: string }[]> {
    return await Promise.all(
      this.configs.all(paths, ids).map(async ({ resource, config }) => ({
        resource,
        path: await this.workspace.writeConfig(resource, config),
      })),
    );
  }

  /** Where each Worker's code and each site's files are, from `source`. */
  async paths(source: Source): Promise<Paths> {
    const mains = new Map<string, string>();
    for (const [name, worker] of Object.entries(this.plan.workers)) {
      mains.set(
        name,
        source === "builds" && worker.sync
          ? await this.workspace.synced(name, worker.sync)
          : await this.workspace.unpack(name, worker.code),
      );
    }
    const sites = new Map<string, string>();
    for (const [name, bucket] of Object.entries(this.plan.buckets)) {
      if (!bucket.contents) continue;
      sites.set(
        name,
        source === "builds" && bucket.sync
          ? this.workspace.syncedSite(name, bucket.sync)
          : await this.workspace.site(name, bucket.contents),
      );
    }
    const gatewayMain = await this.workspace.gatewayMain();
    return {
      workerMain: (worker) => mains.get(worker)!,
      gatewayMain,
      assets: (bucket) => sites.get(bucket)!,
    };
  }

  /** Each table's `items` created where it isn't yet, through the configuration of a Worker bound to it. */
  async schemas(
    configs: readonly { resource: string; path: string }[],
    local?: { persistTo: string },
  ): Promise<void> {
    for (const [table, database] of Object.entries(this.plan.databases)) {
      const bound = configs.find(({ resource }) =>
        this.plan.workers[resource]?.tables.includes(table)
      );
      if (!bound) continue;
      await this.wrangler.execute(
        this.configs.databaseName(table),
        itemsTable(database),
        {
          config: bound.path,
          ...(local ? { local } : {}),
        },
      );
    }
  }

  /** Each table's D1 database, created if the account doesn't have it yet. */
  private async databases(): Promise<DatabaseIds> {
    let existing = await this.wrangler.databases();
    const missing = Object.keys(this.plan.databases).filter((table) =>
      !existing.has(this.configs.databaseName(table))
    );
    for (const table of missing) {
      await this.wrangler.createDatabase(this.configs.databaseName(table));
    }
    if (missing.length > 0) existing = await this.wrangler.databases();
    return this.idsFrom(existing);
  }

  private idsFrom(existing: ReadonlyMap<string, string>): DatabaseIds {
    return Object.fromEntries(
      Object.keys(this.plan.databases).flatMap((table) => {
        const id = existing.get(this.configs.databaseName(table));
        return id ? [[table, id]] : [];
      }),
    );
  }

  /** Each R2 bucket created if missing, its CORS rules set — a site's files aren't one: they're its gateway's assets. */
  private async buckets(): Promise<void> {
    const existing = await this.wrangler.buckets();
    for (const bucket of Object.values(this.plan.buckets)) {
      if (bucket.contents) continue;
      if (!existing.has(bucket.bucket)) {
        await this.wrangler.createBucket(bucket.bucket);
      }
      if (!bucket.cors) continue;
      const dir = await Deno.makeTempDir({ prefix: "ens-cloudflare-cors-" });
      try {
        const file = join(dir, "cors.json");
        await Deno.writeTextFile(
          file,
          JSON.stringify({
            rules: bucket.cors.map((rule) => ({
              allowed: {
                origins: rule.origins,
                methods: rule.methods,
                ...(rule.headers ? { headers: rule.headers } : {}),
              },
              ...(rule.exposeHeaders
                ? { exposeHeaders: rule.exposeHeaders }
                : {}),
              ...(rule.maxAge !== undefined
                ? { maxAgeSeconds: rule.maxAge }
                : {}),
            })),
          }),
        );
        await this.wrangler.setCors(bucket.bucket, file);
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    }
  }

  private needsCredentials(resource: string): boolean {
    return (this.plan.workers[resource]?.buckets.length ?? 0) > 0;
  }

  /** The R2 key pair as a secrets file for the Workers granted buckets — `undefined` when none is. */
  private async secretsFile(): Promise<string | undefined> {
    if (
      !Object.keys(this.plan.workers).some((resource) =>
        this.needsCredentials(resource)
      )
    ) return undefined;
    const accessKeyId = Deno.env.get(R2_ACCESS_KEY_ID);
    const secretAccessKey = Deno.env.get(R2_SECRET_ACCESS_KEY);
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        `A Worker granted buckets signs its S3 requests with an R2 API token's key pair: set ${R2_ACCESS_KEY_ID} and ${R2_SECRET_ACCESS_KEY}.`,
      );
    }
    const dir = await Deno.makeTempDir({ prefix: "ens-cloudflare-secrets-" });
    const file = join(dir, "secrets.json");
    await Deno.writeTextFile(
      file,
      JSON.stringify({
        [CREDENTIAL_VARS.accessKeyId]: accessKeyId,
        [CREDENTIAL_VARS.secretAccessKey]: secretAccessKey,
      }),
      { mode: 0o600 },
    );
    return file;
  }
}
