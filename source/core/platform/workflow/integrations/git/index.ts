import type * as Core from "@ensemble/core";
import { GitIntegrationHandlers } from "./handler.ts";
import { route, type Feature } from "../../../features.ts";

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
  SetWebhookSecretRequest,
} from "./contract.ts";

/** Builds this module's routes, bound to `repositories` — call once at startup with the process's own GitRepositoryStore instance. */
export function createGitIntegrationFeatures(
  repositories: Core.GitRepositories.GitRepositoryStore,
  basePath: string,
): Feature[] {
  const handlers = new GitIntegrationHandlers(repositories);

  return [
    route("git-integration-register", "POST", `${basePath}/register`, (request) => handlers.handleRegisterRepository(request)),
    route("git-integration-repositories-list", "GET", `${basePath}/repositories`, (request) => handlers.handleListRepositories(request)),
    route("git-integration-repository-refresh", "POST", `${basePath}/repositories/:projectName/refresh`, (request, params) => handlers.handleRefreshRepository(request, params)),
    route("git-integration-repository-remove", "POST", `${basePath}/repositories/:projectName/remove`, (request, params) => handlers.handleRemoveRepository(request, params)),
    route("git-integration-repository-secrets-key-set", "POST", `${basePath}/repositories/:projectName/secrets-key`, (request, params) => handlers.handleSetRepositorySecretsKey(request, params)),
    route("git-integration-repository-webhook-secret-set", "POST", `${basePath}/repositories/:projectName/webhook-secret`, (request, params) => handlers.handleSetWebhookSecret(request, params)),
    route("git-integration-repository-auth-set", "POST", `${basePath}/repositories/:projectName/auth`, (request, params) => handlers.handleSetRepositoryAuth(request, params)),
    route("git-integration-repository-candidates-list", "GET", `${basePath}/repositories/:projectName/candidates`, (request, params) => handlers.handleListRepoWorkflowCandidates(request, params)),
    route("git-integration-tags-list", "GET", `${basePath}/tags`, (request) => handlers.handleListRemoteTags(request)),
  ];
}
