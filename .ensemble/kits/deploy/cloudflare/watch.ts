import { ensureDir } from "@std/fs";
import { Deployment } from "./deployment.ts";
import type { SyncRule } from "./development-sync.ts";
import type { Plan } from "./plan.ts";
import { routeLines } from "./route-listing.ts";
import { Workspace } from "./workspace.ts";
import { Wrangler } from "./wrangler.ts";
import { WranglerConfigs } from "./wrangler-config.ts";

// The cloudflare kit's watch (see main.ts's `watchCommand`), what `ens
// develop` runs, for as long as the session lasts:
//
// - on the local target, every Worker in one `wrangler dev` — the Workers
//   runtime itself, D1 and R2 kept under .ensemble/deploy/<name>/ — each
//   function running its app's build output and each site served from its
//   app's, so a rebuild is live as soon as wrangler reloads it;
// - on an account, the apply, then every Worker whose apps rebuild
//   redeployed — the function itself, or the gateway serving a site.
//
// What the developer needs to see goes to stderr: a quiet session (`ens
// develop` without --verbose) discards this script's stdout.
//
// Usage: watch.ts <plan path> <deployment name>

/** How long a build output has to stay quiet before it's redeployed — a rebuild writes a bundle and its source map separately. */
const SETTLE_MS = 300;

const [planPath, name] = Deno.args;
if (!planPath || !name) {
  throw new Error("usage: watch.ts <plan path> <deployment name>");
}

const plan = JSON.parse(await Deno.readTextFile(planPath)) as Plan;
const configs = new WranglerConfigs(plan, name);
const workspace = new Workspace(planPath);
const deployment = new Deployment(plan, configs, workspace, new Wrangler());

if (plan.target.kind === "local") await runLocally(plan.target.port);
else await keepCurrent();

async function runLocally(port: number): Promise<void> {
  const ids = Object.fromEntries(
    Object.keys(plan.databases).map((table) => [table, `local-${table}`]),
  );
  const written = await deployment.write(await deployment.paths("builds"), ids);
  await ensureDir(workspace.state);
  await deployment.schemas(written, { persistTo: workspace.state });

  for (
    const line of routeLines(
      Object.values(plan.gateways).map((gateway) => ({
        gateway,
        url: `http://localhost:${port}`,
      })),
    )
  ) {
    console.error(line);
  }
  // A gateway first: the first Worker answers the port, the rest are reached through its bindings.
  const ordered = [
    ...written.filter(({ resource }) => resource in plan.gateways),
    ...written.filter(({ resource }) => !(resource in plan.gateways)),
  ];
  const child = new Wrangler().dev(
    ordered.map(({ path }) => path),
    port,
    workspace.state,
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    Deno.addSignalListener(signal, () => child.kill(signal));
  }
  const result = await child;
  Deno.exit(result.code);
}

async function keepCurrent(): Promise<void> {
  for (const line of await deployment.apply("builds")) console.error(line);

  const watched: { resource: string; rules: readonly SyncRule[] }[] = [
    ...Object.entries(plan.workers).flatMap((
      [resource, worker],
    ) => (worker.sync ? [{ resource, rules: worker.sync }] : [])),
    ...Object.entries(plan.buckets).flatMap(([bucket, { sync }]) =>
      sync
        ? Object.entries(plan.gateways)
          .filter(([, gateway]) =>
            gateway.routes.some((route) =>
              "storage" in route.target && route.target.storage === bucket
            )
          )
          .map(([resource]) => ({ resource, rules: sync }))
        : []
    ),
  ];
  const pending = new Set<string>();
  let settling: ReturnType<typeof setTimeout> | undefined;
  let deploying: Promise<void> | undefined;

  const flush = async (): Promise<void> => {
    if (deploying || pending.size === 0) return;
    const resources = new Set(pending);
    pending.clear();
    deploying = deployment.redeploy(resources, "builds")
      .then(() =>
        console.error(
          `${new Date().toLocaleTimeString()} ${
            [...resources].join(", ")
          }: redeployed`,
        )
      )
      .catch((error) =>
        console.error(
          `${[...resources].join(", ")}: ${
            error instanceof Error ? error.message : error
          }`,
        )
      );
    await deploying;
    deploying = undefined;
    await flush();
  };

  for (const { resource, rules } of watched) {
    for (const rule of rules) {
      const source = await workspace.outputOf(rule.app);
      await ensureDir(source);
      onChange(source, () => {
        pending.add(resource);
        clearTimeout(settling);
        settling = setTimeout(flush, SETTLE_MS);
      });
    }
  }
  console.error("Watching for changes. Press Ctrl+C to stop.");
}

/** Calls `changed` on every change under `source`, for as long as the session lasts. */
async function onChange(source: string, changed: () => void): Promise<void> {
  for await (const _event of Deno.watchFs(source, { recursive: true })) {
    changed();
  }
}
