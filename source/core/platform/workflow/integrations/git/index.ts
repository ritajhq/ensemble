import type { GitRepositoryStore } from "@ensemble/core";
import {
  handleListGitRepositories,
  handleListRemoteGitTags,
  handleListRepoWorkflowCandidates,
  handleRefreshGitRepository,
  handleRegisterGitRepository,
  handleRemoveGitRepository,
  handleSetRepositoryAuth,
  handleSetRepositorySecretsKey,
} from "./handler.ts";
import type { Feature } from "../../../features.ts";

export {
  handleListGitRepositories,
  handleListRemoteGitTags,
  handleListRepoWorkflowCandidates,
  handleRefreshGitRepository,
  handleRegisterGitRepository,
  handleRemoveGitRepository,
  handleSetRepositoryAuth,
  handleSetRepositorySecretsKey,
} from "./handler.ts";
export type {
  GitRepositorySummary,
  ListGitRepositoriesResponse,
  ListRemoteGitTagsResponse,
  ListRepoWorkflowCandidatesResponse,
  RefreshGitRepositoryResponse,
  RegisterGitRepositoryRequest,
  RegisterGitRepositoryResponse,
  RepoWorkflowCandidateSummary,
  SetRepositoryAuthRequest,
  SetRepositoryAuthResponse,
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
      name: "git-integration-repository-auth-set",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/auth",
      }),
      handle: (request, params) =>
        handleSetRepositoryAuth(repositories, request, params),
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
    {
      name: "git-integration-tags-list",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/integrations/git/tags" }),
      handle: (request) => handleListRemoteGitTags(repositories, request),
    },
  ];
}
