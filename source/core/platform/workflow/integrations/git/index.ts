import type { GitRepositoryStore } from "@ensemble/core";
import {
  handleListGitRepositories,
  handleListRepoWorkflowCandidates,
  handleRefreshGitRepository,
  handleRegisterGitRepository,
  handleRemoveGitRepository,
  handleSetRepositorySecretsKey,
} from "./handler.ts";
import type { Feature } from "../../../features.ts";

export {
  handleListGitRepositories,
  handleListRepoWorkflowCandidates,
  handleRefreshGitRepository,
  handleRegisterGitRepository,
  handleRemoveGitRepository,
  handleSetRepositorySecretsKey,
} from "./handler.ts";
export type {
  GitRepositorySummary,
  ListGitRepositoriesResponse,
  ListRepoWorkflowCandidatesResponse,
  RefreshGitRepositoryResponse,
  RegisterGitRepositoryRequest,
  RegisterGitRepositoryResponse,
  RepoWorkflowCandidateSummary,
  SetRepositorySecretsKeyRequest,
} from "./contract.ts";

/** Builds this module's routes, bound to `repositories` — call once at startup with the process's own GitRepositoryStore instance. */
export function createGitIntegrationFeatures(
  repositories: GitRepositoryStore,
): Feature[] {
  return [
    {
      name: "git-integration-register",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/integrations/git/register" }),
      handle: (request) => handleRegisterGitRepository(repositories, request),
    },
    {
      name: "git-integration-repositories-list",
      method: "GET",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories",
      }),
      handle: (request) => handleListGitRepositories(repositories, request),
    },
    {
      name: "git-integration-repository-refresh",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/refresh",
      }),
      handle: (request, params) =>
        handleRefreshGitRepository(repositories, request, params),
    },
    {
      name: "git-integration-repository-remove",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/remove",
      }),
      handle: (request, params) =>
        handleRemoveGitRepository(repositories, request, params),
    },
    {
      name: "git-integration-repository-secrets-key-set",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/secrets-key",
      }),
      handle: (request, params) =>
        handleSetRepositorySecretsKey(repositories, request, params),
    },
    {
      name: "git-integration-repository-candidates-list",
      method: "GET",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/candidates",
      }),
      handle: (request, params) =>
        handleListRepoWorkflowCandidates(repositories, request, params),
    },
  ];
}
