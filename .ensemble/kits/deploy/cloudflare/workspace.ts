import { basename, dirname, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { $ } from "@david/dax";
import { unzipSync } from "fflate";
import * as KitSdk from "@ensemble/kit-sdk";
import type { SyncRule } from "./development-sync.ts";

/** The bundle's entry (`function.v1`): the module whose default export answers requests — the Worker itself. */
export const ENTRY = "main.js";
const GATEWAY_RUNTIME = new URL("./runtime/gateway.js", import.meta.url);

/**
 * Where a deployment's Workers live on disk, beside its plan
 * (`source/artifacts/deploy/<name>/plan.json`, `ens deploy`'s own
 * convention): each Worker's configuration, each function's unpacked bundle,
 * the gateway's code and each site's files — every one in a folder of its
 * own, since wrangler watches the folder a Worker's code is in and reloads it
 * on any change there. The local runtime keeps D1 and R2 under
 * `.ensemble/deploy/<name>/` (ignored by git) — the manifest's name, as the
 * plan's own folder is — so they outlive a session.
 */
export class Workspace {
  readonly dir: string;
  readonly artifacts: string;
  readonly state: string;

  private constructor(
    private readonly repoRoot: string,
    planPath: string,
  ) {
    this.dir = join(dirname(planPath), "cloudflare");
    this.artifacts = join(repoRoot, "source", "artifacts");
    this.state = join(
      repoRoot,
      ".ensemble",
      "deploy",
      basename(dirname(planPath)),
      "wrangler",
    );
  }

  /** The workspace of the plan at `planPath`, in the repo the plan was rendered in. */
  static async at(planPath: string): Promise<Workspace> {
    return new Workspace(
      await KitSdk.findRepoRoot(dirname(planPath)),
      planPath,
    );
  }

  /** A function's `main.js` from its bundle — a packed zip, or one published at `s3://…` — unpacked into its own folder. */
  async unpack(resource: string, code: string): Promise<string> {
    const folder = join(this.dir, "workers", resource);
    const zip = code.startsWith("s3://")
      ? await this.download(code, join(this.dir, `${resource}.zip`))
      : code;
    for (
      const [path, bytes] of Object.entries(unzipSync(await Deno.readFile(zip)))
    ) {
      if (path.endsWith("/")) continue;
      await ensureDir(dirname(join(folder, path)));
      await Deno.writeFile(join(folder, path), bytes);
    }
    return await this.entryIn(folder, resource);
  }

  /** A function's `main.js` as its build writes it — the app's cloudflare integration's, when it has one — what `ens develop` runs, reloaded on every rebuild. */
  async synced(resource: string, rules: readonly SyncRule[]): Promise<string> {
    const root = rules.find((rule) => rootOf(rule.path) === "");
    if (!root) {
      throw new Error(
        `compute.${resource}: under ens develop, a Worker runs its app's build output as it is — sync it to "/".`,
      );
    }
    return await this.entryIn(await this.outputOf(root.app), resource);
  }

  /** Where the build `ens develop` keeps current for `app` writes: its cloudflare integration's, or the app's own. */
  async outputOf(app: string): Promise<string> {
    return join(
      this.artifacts,
      await KitSdk.Deploy.buildUnitFor(
        this.repoRoot,
        app,
        "cloudflare",
      ),
    );
  }

  /** A site's files: a local release as it is, or one published at `s3://…` downloaded. */
  async site(resource: string, contents: string): Promise<string> {
    if (!contents.startsWith("s3://")) return contents;
    const folder = join(this.dir, "sites", resource);
    await $`aws s3 sync ${contents} ${folder} --delete --only-show-errors`;
    return folder;
  }

  /** A site's files as its app's build writes them, under `ens develop`. */
  syncedSite(resource: string, rules: readonly SyncRule[]): string {
    const root = rules.find((rule) => rootOf(rule.path) === "");
    if (!root) {
      throw new Error(
        `storage.${resource}: under ens develop, a site is served from its app's build output as it is — sync it to "/".`,
      );
    }
    return join(this.artifacts, root.app);
  }

  /** The gateway Worker's code, copied into a folder nothing else writes to. */
  async gatewayMain(): Promise<string> {
    const path = join(this.dir, "gateway", "gateway.js");
    await ensureDir(dirname(path));
    await Deno.copyFile(GATEWAY_RUNTIME, path);
    return path;
  }

  async writeConfig(
    resource: string,
    config: Record<string, unknown>,
  ): Promise<string> {
    const path = join(this.dir, "config", `${resource}.json`);
    await ensureDir(dirname(path));
    await Deno.writeTextFile(path, `${JSON.stringify(config, null, 2)}\n`);
    return path;
  }

  private async entryIn(folder: string, resource: string): Promise<string> {
    const entry = join(folder, ENTRY);
    if (await exists(entry, { isFile: true })) return entry;
    throw new Error(
      `compute.${resource}: the bundle has no ${ENTRY} — a function.v1 bundle's main.js default-exports { fetch(request, env) }.`,
    );
  }

  private async download(location: string, to: string): Promise<string> {
    await ensureDir(dirname(to));
    await $`aws s3 cp ${location} ${to} --only-show-errors`;
    return to;
  }
}

function rootOf(path: string): string {
  return path.split("/").filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}
