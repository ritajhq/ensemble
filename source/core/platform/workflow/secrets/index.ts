import * as Core from "@ensemble/core";
import { SecretsHandlers } from "./handler.ts";
import type { Feature } from "../../features.ts";

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
): Feature[] {
  const git = Core.GitWrite.createGithubContentsProvider();
  const handlers = new SecretsHandlers({ repositories, links, git });

  return [
    {
      name: "secrets-context-get",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/secrets/:workflowId/:context" }),
      handle: (request, params) => handlers.handleGetContext(request, params),
    },
    {
      name: "secrets-set",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/secrets/:workflowId/:context/:key/set",
      }),
      handle: (request, params) => handlers.handleSetSecret(request, params),
    },
    {
      name: "secrets-delete",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/secrets/:workflowId/:context/:key/delete",
      }),
      handle: (request, params) => handlers.handleDelete(request, params),
    },
    {
      name: "secrets-set-file",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/secrets/:workflowId/:context/:name/set-file",
      }),
      handle: (request, params) =>
        handlers.handleSetSecretFile(request, params),
    },
    {
      name: "secrets-delete-file",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/secrets/:workflowId/:context/:name/delete-file",
      }),
      handle: (request, params) => handlers.handleDeleteFile(request, params),
    },
  ];
}
