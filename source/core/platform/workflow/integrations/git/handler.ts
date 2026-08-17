import {
  type GitAuthStrategy,
  type GitRepositoryStore,
  listRepoWorkflowCandidates,
  refreshGitRepository,
  registerGitRepository,
  removeGitRepository,
  setRepositoryAuth,
  setRepositorySecretsKey,
} from "@ensemble/core";
import { isAuthorizedFor } from "../../../auth/tokens.ts";
import {
  type GitRepositorySummary,
  isRegisterGitRepositoryRequest,
  isSetRepositoryAuthRequest,
  isSetRepositorySecretsKeyRequest,
  type ListGitRepositoriesResponse,
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

/**
 * POST /v1/integrations/git/register — validates access to a git repository
 * (a real clone of its workflows/ folder into a server-side cache, never
 * `workflows/` itself) and persists it as a registered repository. Creates
 * no workflow directories — a repository's content is only ever copied into
 * a workflow via createWorkflow's optional `source`, either at creation time
 * or through the ongoing WorkflowGitLink that keeps it resynced on triggers
 * (see core/workflow.ts's syncWorkflowFromGitLinkIfPresent).
 */
export async function handleRegisterGitRepository(
  repositories: GitRepositoryStore,
  request: Request,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  const text = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, {
      status: 400,
    });
  }
  if (!isRegisterGitRepositoryRequest(body)) {
    return Response.json({
      error:
        'Expected { repoUrl: string, projectName?: string, auth?: { type: "none" } | { type: "pat", token: string }, secretsKey?: string }.',
    }, { status: 400 });
  }

  const auth: GitAuthStrategy = body.auth ?? { type: "none" };

  try {
    const { projectName } = await registerGitRepository(repositories, {
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
export async function handleListGitRepositories(
  repositories: GitRepositoryStore,
  request: Request,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  const records = await repositories.list();
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
export async function handleSetRepositorySecretsKey(
  repositories: GitRepositoryStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const text = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, {
      status: 400,
    });
  }
  if (!isSetRepositorySecretsKeyRequest(body)) {
    return Response.json({ error: "Expected { secretsKey: string }." }, {
      status: 400,
    });
  }

  try {
    await setRepositorySecretsKey(
      repositories,
      resolved.projectName,
      body.secretsKey,
    );
    return Response.json({});
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}

/** POST /v1/integrations/git/repositories/:projectName/auth — updates a registered repository's access credentials (auth strategy — public or a PAT), re-validating clone access before persisting. repoUrl/projectName aren't changeable here; remove and re-register to point at a different URL. */
export async function handleSetRepositoryAuth(
  repositories: GitRepositoryStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const text = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, {
      status: 400,
    });
  }
  if (!isSetRepositoryAuthRequest(body)) {
    return Response.json({
      error:
        'Expected { auth: { type: "none" } | { type: "pat", token: string } }.',
    }, { status: 400 });
  }

  const auth: GitAuthStrategy = body.auth;

  try {
    const updated = await setRepositoryAuth(
      repositories,
      resolved.projectName,
      auth,
    );
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
export async function handleRefreshGitRepository(
  repositories: GitRepositoryStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  try {
    const { projectName, lastFetchedAt } = await refreshGitRepository(
      repositories,
      resolved.projectName,
    );
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
export async function handleRemoveGitRepository(
  repositories: GitRepositoryStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  try {
    await removeGitRepository(repositories, resolved.projectName);
    return Response.json({});
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}

/** GET /v1/integrations/git/repositories/:projectName/candidates — every workflow.yml found in the repo's own workflows/ folder, for the "sync from git" picker. */
export async function handleListRepoWorkflowCandidates(
  repositories: GitRepositoryStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  try {
    const candidates = await listRepoWorkflowCandidates(
      repositories,
      resolved.projectName,
    );
    return Response.json(
      { candidates } satisfies ListRepoWorkflowCandidatesResponse,
    );
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
