import * as Core from "@ensemble/core";
import { handleGetContextValues } from "./handler.ts";
import { route, type Feature } from "../../features.ts";

export { handleGetContextValues } from "./handler.ts";
export type {
  FileSummary,
  SummaryResponse,
  VariableSummary,
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
  repositories: Core.GitRepositories.GitRepositoryStore,
  links: Core.GitRepositories.WorkflowGitLinkStore,
  basePath: string,
): Feature[] {
  const git = Core.GitWrite.createGithubContentsProvider();

  return [
    route("context-values-get", "GET", `${basePath}/:workflowId/:context`, (request, params) => handleGetContextValues(repositories, links, git, request, params)),
  ];
}
