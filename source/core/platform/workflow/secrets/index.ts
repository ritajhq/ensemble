import * as Core from "@ensemble/core";
import { SecretsHandlers } from "./handler.ts";
import { route, type Feature } from "../../features.ts";

export { SecretsHandlers, type SecretsStores } from "./handler.ts";
export {
  noWriteAccessMessage,
  type ContextSummaryResponse,
  type FileSummary,
  type KeySummary,
  type SetSecretFileRequest,
  type SetSecretRequest,
  type SetSecretResponse,
} from "./contract.ts";

/**
 * Builds the dashboard secrets-editor routes, bound to `repositories`/
 * `links` — call once at startup. Only workflows with a WorkflowGitLink
 * (created/synced from a registered git repo) get a working editor here; see
 * handler.ts's resolveGitTarget for the local-only fallback message.
 * Committing goes through a GitWriteProvider (currently GitHub's Contents
 * API, see @ensemble/core's git-write.ts) rather than the read-side sparse
 * clone git-integration.ts already uses — kept behind that interface so a
 * future non-GitHub host is a new implementation, not a rearchitecture.
 */
export function createSecretsFeatures(
  repositories: Core.GitRepositories.GitRepositoryStore,
  links: Core.GitRepositories.WorkflowGitLinkStore,
  basePath: string,
): Feature[] {
  const git = Core.GitWrite.createGithubContentsProvider();
  const handlers = new SecretsHandlers({ repositories, links, git });

  return [
    route("secrets-context-get", "GET", `${basePath}/:workflowId/:context`, (request, params) => handlers.handleGetContext(request, params)),
    route("secrets-set", "POST", `${basePath}/:workflowId/:context/:key/set`, (request, params) => handlers.handleSetSecret(request, params)),
    route("secrets-delete", "POST", `${basePath}/:workflowId/:context/:key/delete`, (request, params) => handlers.handleDelete(request, params)),
    route("secrets-set-file", "POST", `${basePath}/:workflowId/:context/:name/set-file`, (request, params) => handlers.handleSetSecretFile(request, params)),
    route("secrets-delete-file", "POST", `${basePath}/:workflowId/:context/:name/delete-file`, (request, params) => handlers.handleDeleteFile(request, params)),
  ];
}
