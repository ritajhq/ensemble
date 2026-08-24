import * as Core from "@ensemble/core";
import { isAuthorizedFor } from "../../../auth/tokens.ts";
import {
  type GitRepositorySummary,
  isRegisterGitRepositoryRequest,
  isSetRepositoryAuthRequest,
  isSetRepositorySecretsKeyRequest,
  type ListGitRepositoriesResponse,
  type ListRemoteGitTagsResponse,
  type ListRepoWorkflowCandidatesResponse,
  type RefreshGitRepositoryResponse,
  type RegisterGitRepositoryResponse,
  type SetRepositoryAuthResponse,
} from "./contract.ts";

/** Reads the ":projectName" route param, or responds 400 if missing. */
function resolveProjectNameParam(
  params: Record<string, string | undefined>,
): { projectName: string } | { errorResponse: Response } {
  const projectName = params.projectName;
  if (!projectName) {
    return {
      errorResponse: Response.json({ error: "Missing project name in URL." }, {
        status: 400,
      }),
    };
  }
  return { projectName };
}

/** HTTP handlers for /v1/integrations/git/*, constructor-injected with the registered-repository store they operate on. */
export class GitIntegrationHandlers {
  constructor(private readonly repositories: Core.GitRepositories.GitRepositoryStore) {}

  /** Responds 401 if `request` isn't authorized for `scope`, otherwise undefined. */
  private async requireAuth(
    request: Request,
    scope: "read" | "upload",
  ): Promise<Response | undefined> {
    if (await isAuthorizedFor(request, scope)) return undefined;
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  /** Parses `request`'s body as JSON, or an error Response if it isn't valid JSON. */
  private async parseJsonBody(
    request: Request,
  ): Promise<{ body: unknown } | { errorResponse: Response }> {
    const text = await request.text();
    try {
      return { body: JSON.parse(text) };
    } catch {
      return {
        errorResponse: Response.json({
          error: "Request body must be valid JSON.",
        }, { status: 400 }),
      };
    }
  }

  /**
   * POST /v1/integrations/git/register — validates access to a git repository
   * (a real clone of its workflows/ folder into a server-side cache, never
   * `workflows/` itself) and persists it as a registered repository. Creates
   * no workflow directories — a repository's content is only ever copied into
   * a workflow via createWorkflow's optional `source`, either at creation time
   * or through the ongoing WorkflowGitLink that keeps it resynced on triggers
   * (see core/workflow.ts's syncWorkflowFromGitLinkIfPresent).
   */
  async handleRegisterRepository(request: Request): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const parsed = await this.parseJsonBody(request);
    if ("errorResponse" in parsed) return parsed.errorResponse;
    if (!isRegisterGitRepositoryRequest(parsed.body)) {
      return Response.json({
        error:
          'Expected { repoUrl: string, projectName?: string, auth?: { type: "none" } | { type: "pat", token: string }, secretsKey?: string }.',
      }, { status: 400 });
    }
    const body = parsed.body;

    const auth: Core.GitRepositories.GitAuthStrategy = body.auth ?? { type: "none" };

    try {
      const { projectName } = await new Core.GitIntegration.GitIntegrationService(this.repositories)
        .register({
          repoUrl: body.repoUrl,
          projectName: body.projectName,
          auth,
          secretsKey: body.secretsKey,
        });
      return Response.json(
        { projectName } satisfies RegisterGitRepositoryResponse,
      );
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** GET /v1/integrations/git/repositories — every registered repository. */
  async handleListRepositories(request: Request): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const records = await this.repositories.list();
    const summaries: GitRepositorySummary[] = records.map((record) => ({
      projectName: record.projectName,
      repoUrl: record.repoUrl,
      authType: record.auth.type,
      registeredAt: record.registeredAt,
      lastFetchedAt: record.lastFetchedAt,
      hasSecretsKey: record.secretsKey !== undefined,
    }));

    return Response.json(
      { repositories: summaries } satisfies ListGitRepositoriesResponse,
    );
  }

  /** POST /v1/integrations/git/repositories/:projectName/secrets-key — sets or rotates a registered repository's secrets private key, without re-registering. */
  async handleSetRepositorySecretsKey(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const resolved = resolveProjectNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const parsed = await this.parseJsonBody(request);
    if ("errorResponse" in parsed) return parsed.errorResponse;
    if (!isSetRepositorySecretsKeyRequest(parsed.body)) {
      return Response.json({ error: "Expected { secretsKey: string }." }, {
        status: 400,
      });
    }

    try {
      await new Core.GitIntegration.GitIntegrationService(this.repositories)
        .setRepositorySecretsKey(resolved.projectName, parsed.body.secretsKey);
      return Response.json({});
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** POST /v1/integrations/git/repositories/:projectName/auth — updates a registered repository's access credentials (auth strategy — public or a PAT), re-validating clone access before persisting. repoUrl/projectName aren't changeable here; remove and re-register to point at a different URL. */
  async handleSetRepositoryAuth(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const resolved = resolveProjectNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const parsed = await this.parseJsonBody(request);
    if ("errorResponse" in parsed) return parsed.errorResponse;
    if (!isSetRepositoryAuthRequest(parsed.body)) {
      return Response.json({
        error:
          'Expected { auth: { type: "none" } | { type: "pat", token: string } }.',
      }, { status: 400 });
    }

    const auth: Core.GitRepositories.GitAuthStrategy = parsed.body.auth;

    try {
      const updated = await new Core.GitIntegration.GitIntegrationService(this.repositories)
        .setRepositoryAuth(resolved.projectName, auth);
      return Response.json({
        projectName: updated.projectName,
        authType: updated.auth.type,
      } satisfies SetRepositoryAuthResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** POST /v1/integrations/git/repositories/:projectName/refresh — re-fetches a registered repository's cached checkout. Does not touch any workflow. */
  async handleRefreshRepository(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const resolved = resolveProjectNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    try {
      const { projectName, lastFetchedAt } = await new Core.GitIntegration.GitIntegrationService(
        this.repositories,
      ).refresh(resolved.projectName);
      return Response.json(
        { projectName, lastFetchedAt } satisfies RefreshGitRepositoryResponse,
      );
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** POST /v1/integrations/git/repositories/:projectName/remove — unregisters a repository. Workflows previously synced from it keep their last-synced content. */
  async handleRemoveRepository(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const resolved = resolveProjectNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    try {
      await new Core.GitIntegration.GitIntegrationService(this.repositories).remove(
        resolved.projectName,
      );
      return Response.json({});
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** GET /v1/integrations/git/repositories/:projectName/candidates — every workflow.yml found in the repo's own workflows/ folder, for the "sync from git" picker. */
  async handleListRepoWorkflowCandidates(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveProjectNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    try {
      const candidates = await new Core.GitIntegration.GitIntegrationService(this.repositories)
        .listRepoWorkflowCandidates(resolved.projectName);
      return Response.json(
        { candidates } satisfies ListRepoWorkflowCandidatesResponse,
      );
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /**
   * GET /v1/integrations/git/tags?repoUrl=... — tag names from an arbitrary
   * remote repository, for a `git-tags` manual trigger input's picker. Not
   * scoped to a registered project (the URL a workflow.yml declares needn't be
   * registered) — reuses a registered repo's auth when `repoUrl` happens to
   * match one, otherwise fetches unauthenticated.
   */
  async handleListRemoteTags(request: Request): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const repoUrl = new URL(request.url).searchParams.get("repoUrl");
    if (!repoUrl) {
      return Response.json({ error: "Missing \"repoUrl\" query parameter." }, {
        status: 400,
      });
    }

    const tags = await new Core.GitIntegration.GitIntegrationService(this.repositories)
      .listRemoteGitTags(repoUrl);
    return Response.json({ tags } satisfies ListRemoteGitTagsResponse);
  }
}
