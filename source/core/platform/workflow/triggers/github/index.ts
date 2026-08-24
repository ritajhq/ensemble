import type * as Core from "@ensemble/core";
import { handle } from "./handler.ts";
import { handleManual } from "./manual-handler.ts";
import type { Feature } from "../../../features.ts";

export { handle } from "./handler.ts";
export { handleManual } from "./manual-handler.ts";
export {
  isManualTriggerRequest,
  type ManualTriggerRequest,
  type ManualTriggerResponse,
} from "./manual-contract.ts";

export interface GithubTriggerStores {
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  runs: Core.Runs.RunStore;
}

/** Builds this module's routes, bound to `stores` — call once at startup with the process's own store instances. */
export function createGithubTriggerFeatures(stores: GithubTriggerStores): Feature[] {
  const { repositories, links, runs } = stores;

  return [
    {
      name: "github-trigger",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/webhooks/github" }),
      handle: (request) => handle(repositories, links, runs, request),
    },
    {
      name: "manual-github-trigger",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/trigger/github" }),
      handle: (request, params) => handleManual(repositories, links, runs, request, params),
    },
  ];
}
