import { Checkouts } from "./checkouts.ts";
import { Configuration } from "./configuration.ts";
import { Ensemble } from "./ensemble.ts";
import { GithubWebhook } from "./github-webhook.ts";
import { Network } from "./network.ts";
import { EnsemblePreviewWork } from "./preview-work.ts";
import { Previews } from "./previews.ts";

const configurationPath = Deno.env.get("PREVIEW_CONFIG") ?? "preview.yml";
const port = Number(Deno.env.get("PORT") ?? 8080);

const configuration = Configuration.parse(
  await Deno.readTextFile(configurationPath),
);

const previews = new Previews(
  new EnsemblePreviewWork(
    new Checkouts(configuration.workspace, Deno.env.get("GITHUB_TOKEN")),
    new Network(configuration.network),
    new Ensemble(Deno.env.get("ENS_BIN") ?? "ens"),
  ),
);

/** Each preview's last outcome, for the `/` page. */
const outcomes = new Map<string, string>();

previews.OnDeployed.Do((preview) => {
  outcomes.set(preview.host, `deployed ${new Date().toISOString()}`);
  console.log(
    `deployed ${preview.repository.name}@${preview.branch} -> https://${preview.host}`,
  );
});
previews.OnDestroyed.Do((preview) => {
  outcomes.delete(preview.host);
  console.log(`destroyed ${preview.repository.name}@${preview.branch}`);
});
previews.OnFailed.Do((preview, intent, error) => {
  outcomes.set(preview.host, `${intent} failed ${new Date().toISOString()}`);
  console.error(
    `${intent} failed for ${preview.repository.name}@${preview.branch}:`,
    error,
  );
});

Deno.serve({ port }, async (request) => {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/") {
    const lines = [...outcomes].map(([host, outcome]) => `${host}  ${outcome}`);
    return new Response(lines.join("\n") + "\n");
  }

  const match = pathname.match(/^\/webhook\/([^/]+)$/);
  if (request.method !== "POST" || !match) {
    return new Response("Not found", { status: 404 });
  }

  const repository = configuration.repository(match[1]);
  if (!repository) return new Response("Unknown repository", { status: 404 });

  const secret = Deno.env.get(repository.webhookSecretEnvVar);
  if (!secret) {
    console.error(`No webhook secret configured for "${repository.id}"`);
    return new Response("Misconfigured", { status: 500 });
  }

  const { response, event } = await new GithubWebhook(secret, repository.name)
    .interpret(request);
  if (!event || !repository.tracks(event.branch)) return response;

  const preview = configuration.previewOf(repository, event.branch);
  if (event.kind === "pushed") previews.pushed(preview);
  else previews.deleted(preview);
  return response;
});
