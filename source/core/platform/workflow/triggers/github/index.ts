import type { GitRepositoryStore, RunStore, WorkflowGitLinkStore } from "@ensemble/core";
import { handleGithubTrigger } from "./handler.ts";
import { handleManualGithubTrigger } from "./manual-handler.ts";
import type { Feature } from "../../../features.ts";

export { handleGithubTrigger } from "./handler.ts";
export { handleManualGithubTrigger } from "./manual-handler.ts";
export {
  isManualGithubTriggerRequest,
  type ManualGithubTriggerRequest,
  type ManualGithubTriggerResponse,
} from "./manual-contract.ts";

export interface GithubTriggerStores {
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
  runs: RunStore;
}

/** Builds this module's routes, bound to `stores` — call once at startup with the process's own store instances. */
export function createGithubTriggerFeatures(stores: GithubTriggerStores): Feature[] {
  const { repositories, links, runs } = stores;

  return [
    {
      name: "github-trigger",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/webhooks/github" }),
      handle: (request) => handleGithubTrigger(repositories, links, runs, request),
    },
    {
      name: "manual-github-trigger",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/trigger/github" }),
      handle: (request, params) => handleManualGithubTrigger(repositories, links, runs, request, params),
    },
  ];
}
