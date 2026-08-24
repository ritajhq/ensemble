import type * as Core from "@ensemble/core";
import { GitIntegrationHandlers } from "./handler.ts";
import type { Feature } from "../../../features.ts";

export { GitIntegrationHandlers } from "./handler.ts";
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
  repositories: Core.GitRepositories.GitRepositoryStore,
): Feature[] {
  const handlers = new GitIntegrationHandlers(repositories);

  return [
    {
      name: "git-integration-register",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/integrations/git/register" }),
      handle: (request) => handlers.handleRegisterRepository(request),
    },
    {
      name: "git-integration-repositories-list",
      method: "GET",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories",
      }),
      handle: (request) => handlers.handleListRepositories(request),
    },
    {
      name: "git-integration-repository-refresh",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/refresh",
      }),
      handle: (request, params) =>
        handlers.handleRefreshRepository(request, params),
    },
    {
      name: "git-integration-repository-remove",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/remove",
      }),
      handle: (request, params) =>
        handlers.handleRemoveRepository(request, params),
    },
    {
      name: "git-integration-repository-secrets-key-set",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/secrets-key",
      }),
      handle: (request, params) =>
        handlers.handleSetRepositorySecretsKey(request, params),
    },
    {
      name: "git-integration-repository-auth-set",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/auth",
      }),
      handle: (request, params) =>
        handlers.handleSetRepositoryAuth(request, params),
    },
    {
      name: "git-integration-repository-candidates-list",
      method: "GET",
      pattern: new URLPattern({
        pathname: "/v1/integrations/git/repositories/:projectName/candidates",
      }),
      handle: (request, params) =>
        handlers.handleListRepoWorkflowCandidates(request, params),
    },
    {
      name: "git-integration-tags-list",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/integrations/git/tags" }),
      handle: (request) => handlers.handleListRemoteTags(request),
    },
  ];
}
