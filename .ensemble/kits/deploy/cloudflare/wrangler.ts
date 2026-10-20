import { $ } from "@david/dax";

/**
 * The kit's own wrangler, so a deploy doesn't depend on whichever one the
 * machine has: the npm package at the version this kit's deno.json pins
 * (and deno.lock locks), run by the same `deno` running this kit — wrangler
 * is an npm CLI, and Deno's npm support runs it with no Node toolchain.
 */
const WRANGLER = "npm:wrangler@4.147.0";

/**
 * Cloudflare as the kit reaches it: wrangler, with the environment's
 * credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and never a
 * prompt — `CI` tells wrangler nobody is there to answer one.
 */
export class Wrangler {
  private readonly env = { CI: "true", WRANGLER_SEND_METRICS: "false" };

  /** Every D1 database in the account, by name, with its id. */
  async databases(): Promise<Map<string, string>> {
    const listed = await this.run(["d1", "list", "--json"]).stdout("piped")
      .text();
    const databases = JSON.parse(listed) as { name: string; uuid: string }[];
    return new Map(
      databases.map((database) => [database.name, database.uuid]),
    );
  }

  async createDatabase(name: string): Promise<void> {
    await this.run(["d1", "create", name]).stdout("null");
  }

  /** Runs `sql` against database `name` — in the account, or on this machine's runtime kept at `persistTo`. */
  async execute(
    name: string,
    sql: string,
    where: { config: string; local?: { persistTo: string } },
  ): Promise<void> {
    const location = where.local
      ? ["--local", "--persist-to", where.local.persistTo]
      : ["--remote"];
    await this.run([
      "d1",
      "execute",
      name,
      "--config",
      where.config,
      ...location,
      "--command",
      sql,
    ]).stdout("null");
  }

  async buckets(): Promise<Set<string>> {
    const listed = await this.run(["r2", "bucket", "list"]).stdout("piped")
      .text();
    return new Set(
      [...listed.matchAll(/^name:\s+(\S+)/gm)].map((match) => match[1]!),
    );
  }

  async createBucket(name: string): Promise<void> {
    await this.run(["r2", "bucket", "create", name]).stdout("null");
  }

  async setCors(bucket: string, rulesFile: string): Promise<void> {
    await this.run([
      "r2",
      "bucket",
      "cors",
      "set",
      bucket,
      "--file",
      rulesFile,
      "--force",
    ]).stdout("null");
  }

  /** Deploys the Worker `config` describes, resolving to wrangler's own report of it (where it answers, for one on workers.dev). */
  async deploy(config: string, secretsFile?: string): Promise<string> {
    const secrets = secretsFile ? ["--secrets-file", secretsFile] : [];
    return await this.run(["deploy", "--config", config, ...secrets]).stdout(
      "piped",
    ).text();
  }

  /** The Workers `configs` describe, run locally on `port` — the first one answering it, the rest reached through its bindings — until killed. */
  dev(configs: readonly string[], port: number, persistTo: string) {
    const args = [
      "dev",
      ...configs.flatMap((config) => ["--config", config]),
      "--port",
      String(port),
      "--persist-to",
      persistTo,
    ];
    return this.run(args).noThrow().spawn();
  }

  private run(args: readonly string[]) {
    return $`${Deno.execPath()} run -A -q ${WRANGLER} ${args}`.env(this.env);
  }
}
