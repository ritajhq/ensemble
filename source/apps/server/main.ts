import {
  findRepoRoot,
  GIT_REPOSITORY_STORE_KV_PATH,
  GitRepositoryStore,
  RUN_STORE_KV_PATH,
  RunStore,
  WORKFLOW_GIT_LINK_STORE_KV_PATH,
  WorkflowGitLinkStore,
} from "@ensemble/core";
import { createAllFeatures, isFeatureEnabled } from "@ensemble/platform";

const repoRoot = await findRepoRoot();
const stores = {
  repositories: new GitRepositoryStore(
    await Deno.openKv(`${repoRoot}/${GIT_REPOSITORY_STORE_KV_PATH}`),
  ),
  links: new WorkflowGitLinkStore(
    await Deno.openKv(`${repoRoot}/${WORKFLOW_GIT_LINK_STORE_KV_PATH}`),
  ),
  runs: new RunStore(await Deno.openKv(`${repoRoot}/${RUN_STORE_KV_PATH}`)),
};

const allFeatures = createAllFeatures(stores);
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
