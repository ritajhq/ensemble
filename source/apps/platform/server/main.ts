import { dirname } from "@std/path";
import * as Platform from "@ensemble/platform";
import { Api } from "./api.ts";
import { Checkouts } from "./checkouts.ts";
import { Runner } from "./runner.ts";
import { Endpoints } from "./endpoints.ts";
import { Ensemble } from "./ensemble.ts";
import * as Github from "./github/index.ts";
import { GithubApi } from "./github-api.ts";
import { ChildProcess, Container } from "./execution.ts";
import { Previews } from "./previews.ts";
import { PreviewsApi } from "./previews-api.ts";
import { ConfigurationLoader } from "./config.ts";
import * as Kv from "./kv.ts";
import { Router } from "./router.ts";
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
const vault = await Vault.of(configuration.secretKey);
const values = new Kv.Values(kv, vault);
const credentials = new Kv.Credentials(kv, vault);
const runs = new Kv.Runs(kv);
const previewSettings = new Kv.PreviewSettings(kv);
const livePreviews = new Kv.LivePreviews(kv);
const router = new Router(
  new Kv.Ingresses(kv),
  configuration.routerConfiguration,
  configuration.own.map(({ host, upstream }) => ({
    owner: "platform",
    ingresses: [{
      alias: upstream.hostname,
      port: Number(upstream.port || 80),
      scheme: "http",
      hosts: [host],
    }],
  })),
  {
    ...(configuration.previewGuard
      ? {
        guard: {
          host: configuration.previewGuard.hostname,
          port: Number(configuration.previewGuard.port || 80),
        },
      }
      : {}),
    ...(configuration.sessionCookie
      ? { sessionCookie: configuration.sessionCookie }
      : {}),
  },
);

const githubApps = new Github.Apps(kv, vault);
const github = new Github.Rest();
const tokens = new Github.Tokens(githubApps, github);
const checkouts = new Checkouts(configuration.workspace, tokens);
const synchronization = new Synchronization(
  checkouts,
  Platform.Discovery.standard(),
);
const runner = new Runner(
  projects,
  environments,
  values,
  credentials,
  previewSettings,
  checkouts,
  new Ensemble(
    configuration.ens,
    Deno.env,
    configuration.runs
      ? new Container(configuration.runs.image, configuration.runs.mounts)
      : new ChildProcess(),
  ),
  new Github.Releasers(githubApps, tokens),
  configuration.previewDomain,
  configuration.stack,
);
const previews = new Previews(previewSettings, livePreviews, runs);
const endpoints = new Endpoints();
const api = new Api(
  projects,
  catalogs,
  syncs,
  environments,
  values,
  credentials,
  runs,
  checkouts,
  new RunFeed(runs, runner),
  router,
  endpoints,
);
new PreviewsApi(
  projects,
  catalogs,
  environments,
  previewSettings,
  livePreviews,
  previews,
  endpoints,
);
const githubApi = new GithubApi(
  githubApps,
  new Github.Setup(githubApps, github, configuration.url),
  tokens,
  new Github.Webhook(githubApps),
  projects,
  endpoints,
);

// What the platform does, in response to what it's asked: a project added or
// a sync asked for brings its checkout up to date; a sync's outcome is kept,
// and every manifest it found gets its first environment.
api.OnProjectAdded.Do((project) => synchronization.request(project));
api.OnSyncRequested.Do((project) => synchronization.request(project));

// A push to a project's own branch brings its checkout up to date, wherever
// it was pushed from: a release made elsewhere is deployable here at once.
githubApi.OnBranchPushed.Do((project, branch) => {
  if (branch !== project.ref) return;
  synchronization.request(project);
});

// A deploy, release or preview change asked for is carried out once the
// checkout it needs is free; each step it takes, and each line it prints, is
// kept. A branch pushed or deleted asks for preview changes.
api.OnRunRequested.Do((run) => runner.request(run));
previews.OnRunRequested.Do((run) => runner.request(run));
githubApi.OnBranchPushed.Do((project, branch) =>
  previews.pushed(project.id, branch)
);
githubApi.OnBranchDeleted.Do((project, branch) =>
  previews.deleted(project.id, branch)
);
runner.OnStarted.Do((run) => runs.save(run));
runner.OnPrinted.Do((run, index, line) => runs.addLine(run.id, index, line));
runner.OnFinished.Do((run) => runs.save(run));

// A deployment or preview that came up answers where it recorded; the router
// is told, and routes to it from then on — until it is taken down.
runner.OnAnswering.Do((owner, ingresses) => router.answering(owner, ingresses));
runner.OnWithdrawn.Do((owner) => router.withdraw(owner));
runner.OnPreviewUp.Do((preview) => livePreviews.up(preview));
runner.OnPreviewDown.Do((change) =>
  livePreviews.down(change.project, change.manifest, change.branch)
);
await router.publish();

// Runs a restart left unfinished are taken up again, once everything a run
// announces to is listening.
runner.recover(await runs.unfinished());

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

const server = new Server(endpoints, await WebApp.load(configuration.web));

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
