import {
  createGithubContentsProvider,
  type GitRepositoryStore,
  type WorkflowGitLinkStore,
} from "@ensemble/core";
import {
  handleDeleteSecret,
  handleGetSecretsContext,
  handleSetSecret,
} from "./handler.ts";
import type { Feature } from "../../features.ts";

export {
  handleDeleteSecret,
  handleGetSecretsContext,
  handleSetSecret,
} from "./handler.ts";
export {
  noWriteAccessMessage,
  type SecretKeySummary,
  type SecretsContextSummaryResponse,
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
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
): Feature[] {
  const git = createGithubContentsProvider();

  return [
    {
      name: "secrets-context-get",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/secrets/:workflowId/:context" }),
      handle: (request, params) =>
        handleGetSecretsContext(repositories, links, git, request, params),
    },
    {
      name: "secrets-set",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/secrets/:workflowId/:context/:key/set",
      }),
      handle: (request, params) =>
        handleSetSecret(repositories, links, git, request, params),
    },
    {
      name: "secrets-delete",
      method: "POST",
      pattern: new URLPattern({
        pathname: "/v1/secrets/:workflowId/:context/:key/delete",
      }),
      handle: (request, params) =>
        handleDeleteSecret(repositories, links, git, request, params),
    },
  ];
}
