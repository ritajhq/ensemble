import {
  createGithubContentsProvider,
  type GitRepositoryStore,
  type WorkflowGitLinkStore,
} from "@ensemble/core";
import { handleGetContextValues } from "./handler.ts";
import type { Feature } from "../../features.ts";

export { handleGetContextValues } from "./handler.ts";
export type {
  ContextFileSummary,
  ContextValuesSummaryResponse,
  ContextVariableSummary,
} from "./contract.ts";

/**
 * Builds the dashboard's read-only context.variables/context.files view,
 * bound to `repositories`/`links` — call once at startup. Same
 * WorkflowGitLink-gated access as the secrets editor (see
 * ../secrets/index.ts), but plaintext and read-only: no set/delete routes,
 * since these values aren't secrets and are edited by committing
 * workflow.yml / contexts/<name>/variables.yml directly.
 */
export function createContextValuesFeatures(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
): Feature[] {
  const git = createGithubContentsProvider();

  return [
    {
      name: "context-values-get",
      method: "GET",
      pattern: new URLPattern({
        pathname: "/v1/context-values/:workflowId/:context",
      }),
      handle: (request, params) =>
        handleGetContextValues(repositories, links, git, request, params),
    },
  ];
}
