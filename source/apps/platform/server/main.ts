import { dirname } from "@std/path";
import * as Platform from "@ensemble/platform";
import { Api } from "./api.ts";
import { Checkouts } from "./checkouts.ts";
import { Deploys } from "./deploys.ts";
import { Ensemble } from "./ensemble.ts";
import { ConfigurationLoader } from "./config.ts";
import * as Kv from "./kv.ts";
import { RunFeed } from "./run-feed.ts";
import { Server, WebApp } from "./server.ts";
import { Synchronization } from "./synchronization.ts";
import { Vault } from "./vault.ts";

const configuration = new ConfigurationLoader(
  Deno.env,
  new URL("../../../artifacts/platform/web", import.meta.url).pathname,
).load();

await Deno.mkdir(dirname(configuration.database), { recursive: true });
const kv = await Deno.openKv(configuration.database);
const projects = new Kv.Projects(kv);
const catalogs = new Kv.Catalogs(kv);
const syncs = new Kv.Syncs(kv);
const environments = new Kv.Environments(kv);
const values = new Kv.Values(kv, await Vault.of(configuration.secretKey));
const runs = new Kv.Runs(kv);

const checkouts = new Checkouts(
  configuration.workspace,
  configuration.githubToken,
);
const synchronization = new Synchronization(
  checkouts,
  Platform.Discovery.standard(),
);
const deploys = new Deploys(
  projects,
  environments,
  values,
  checkouts,
  new Ensemble(configuration.ens),
);
const api = new Api(
  projects,
  catalogs,
  syncs,
  environments,
  values,
  runs,
  checkouts,
  new RunFeed(runs, deploys),
);

// What the platform does, in response to what it's asked: a project added or
// a sync asked for brings its checkout up to date; a sync's outcome is kept,
// and every manifest it found gets its first environment.
api.OnProjectAdded.Do((project) => synchronization.request(project));
api.OnSyncRequested.Do((project) => synchronization.request(project));

// A deploy asked for is carried out once its project's checkout is free;
// each step it takes, and each line it prints, is kept.
api.OnDeployRequested.Do((run) => deploys.request(run));
deploys.OnStarted.Do((run) => runs.save(run));
deploys.OnPrinted.Do((run, index, line) => runs.addLine(run.id, index, line));
deploys.OnFinished.Do((run) => runs.save(run));

synchronization.OnStarted.Do((project) =>
  syncs.record(project.id, { state: "syncing", at: now() })
);
synchronization.OnSynced.Do(async (project, catalog) => {
  await catalogs.save(project.id, catalog);
  await environments.ensureFirst(project.id, catalog.manifests);
  await syncs.record(project.id, {
    state: "synced",
    at: now(),
    commit: catalog.commit,
  });
});
synchronization.OnFailed.Do((project, error) => {
  console.error(`sync of "${project.id}" failed:`, error);
  return syncs.record(project.id, {
    state: "failed",
    at: now(),
    error: error instanceof Error ? error.message : String(error),
  });
});

const server = new Server(api, await WebApp.load(configuration.web));

Deno.serve(
  {
    port: configuration.port,
    onError: (error) => {
      console.error(error);
      return new Response(null, { status: 500 });
    },
  },
  (request) => server.handle(request),
);

function now(): string {
  return new Date().toISOString();
}
