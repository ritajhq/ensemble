import * as Core from "@ensemble/core";
import { createAllFeatures, isFeatureEnabled, type PlatformRoutePrefixes } from "@ensemble/platform";

const repoRoot = await Core.findRepoRoot();
const stores = {
  repositories: new Core.GitRepositories.GitRepositoryStore(
    await Deno.openKv(`${repoRoot}/${Core.GitRepositories.GIT_REPOSITORY_STORE_KV_PATH}`),
  ),
  links: new Core.GitRepositories.WorkflowGitLinkStore(
    await Deno.openKv(`${repoRoot}/${Core.GitRepositories.WORKFLOW_GIT_LINK_STORE_KV_PATH}`),
  ),
  runs: new Core.Runs.RunStore(await Deno.openKv(`${repoRoot}/${Core.Runs.RUN_STORE_KV_PATH}`)),
};

const routes: PlatformRoutePrefixes = {
  workflowsBasePath: "/v1/workflows",
  authPath: "/v1/auth/ws-token",
  secretsBasePath: "/v1/secrets",
  contextValuesBasePath: "/v1/context-values",
  gitIntegrationBasePath: "/v1/integrations/git",
  githubWebhookPath: "/v1/webhooks/github",
  debugPath: "/v1/debug",
};

const allFeatures = createAllFeatures(stores, routes);
const enabled = allFeatures.filter((feature) => isFeatureEnabled(feature.name));
const disabled = allFeatures.filter((feature) =>
  !isFeatureEnabled(feature.name)
);

for (const feature of enabled) {
  console.log(
    `mounted  ${feature.method} ${feature.pattern.pathname}  (${feature.name})`,
  );
}
for (const feature of disabled) {
  console.log(
    `disabled ${feature.method} ${feature.pattern.pathname}  (${feature.name})`,
  );
}

const port = Number(Deno.env.get("PORT") ?? "8787");

Deno.serve({ port }, (request) => {
  for (const feature of enabled) {
    if (request.method !== feature.method) continue;
    const match = feature.pattern.exec(request.url);
    if (match) return feature.handle(request, match.pathname.groups);
  }
  return new Response("Not found", { status: 404 });
});
