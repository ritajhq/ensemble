import {
  cloneWorkflowsFromGit,
  decodeWorkflowId,
  listGitRepositories,
  listWorkflowsForProject,
  refreshGitRepository,
  removeGitRepository,
  removeGitRepositoryWorkflow,
  restoreGitRepositoryWorkflow,
} from "@ensemble/core";
import { isAuthorizedFor } from "../../../auth/tokens.ts";
import {
  type CloneGitWorkflowsResponse,
  type GitRepositorySummary,
  isCloneGitWorkflowsRequest,
  type ListGitRepositoriesResponse,
  type RefreshGitRepositoryResponse,
} from "./contract.ts";

/**
 * POST /v1/integrations/git/clone — sparse-checks out only a git repo's
 * workflows/ folder and lands it at workflows/<projectName>/ in this repo
 * (see cloneWorkflowsFromGit), so pipelines from multiple external repos can
 * be brought in without colliding on workflow names.
 */
export async function handleCloneGitWorkflows(request: Request): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const text = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isCloneGitWorkflowsRequest(body)) {
    return Response.json({ error: "Expected { repoUrl: string, projectName?: string }." }, { status: 400 });
  }

  try {
    const { projectName } = await cloneWorkflowsFromGit({
      repoUrl: body.repoUrl,
      projectName: body.projectName,
    });
    return Response.json({ projectName } satisfies CloneGitWorkflowsResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

/** Reads the ":projectName" route param, or responds 400 if missing. */
function resolveProjectNameParam(
  params: Record<string, string | undefined>,
): { projectName: string } | { errorResponse: Response } {
  const projectName = params.projectName;
  if (!projectName) {
    return { errorResponse: Response.json({ error: "Missing project name in URL." }, { status: 400 }) };
  }
  return { projectName };
}

/** Decodes the ":workflowName" route param (base64url, since workflow names can contain "/"), or responds 400 if missing/invalid. */
function resolveWorkflowNameParam(
  params: Record<string, string | undefined>,
): { workflowName: string } | { errorResponse: Response } {
  const encoded = params.workflowName;
  if (!encoded) {
    return { errorResponse: Response.json({ error: "Missing workflow name in URL." }, { status: 400 }) };
  }
  try {
    return { workflowName: decodeWorkflowId(encoded) };
  } catch (error) {
    return {
      errorResponse: Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 }),
    };
  }
}

/** GET /v1/integrations/git/repositories — every integrated repository, each with the workflows it currently contains. */
export async function handleListGitRepositories(request: Request): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const records = await listGitRepositories();
  const repositories = await Promise.all(records.map(async (record): Promise<GitRepositorySummary> => {
    const workflows = await listWorkflowsForProject(record.projectName);
    return {
      projectName: record.projectName,
      repoUrl: record.repoUrl,
      clonedAt: record.clonedAt,
      workflows: workflows.map(({ name }) => ({ name })),
      removedWorkflows: record.removedWorkflows,
    };
  }));

  return Response.json({ repositories } satisfies ListGitRepositoriesResponse);
}

/** POST /v1/integrations/git/repositories/:projectName/refresh — re-clones an integrated repository. */
export async function handleRefreshGitRepository(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  try {
    const { projectName, clonedAt } = await refreshGitRepository(resolved.projectName);
    return Response.json({ projectName, clonedAt } satisfies RefreshGitRepositoryResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

/** POST /v1/integrations/git/repositories/:projectName/remove — drops an integrated repository and its workflows. */
export async function handleRemoveGitRepository(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  try {
    await removeGitRepository(resolved.projectName);
    return Response.json({});
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

/** POST /v1/integrations/git/repositories/:projectName/workflows/:workflowName/remove — removes one workflow, leaving siblings and the repo intact. */
export async function handleRemoveGitRepositoryWorkflow(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;
  const resolvedWorkflow = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolvedWorkflow) return resolvedWorkflow.errorResponse;

  try {
    await removeGitRepositoryWorkflow(resolved.projectName, resolvedWorkflow.workflowName);
    return Response.json({});
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

/** POST /v1/integrations/git/repositories/:projectName/workflows/:workflowName/restore — re-clones just this one previously-removed workflow. */
export async function handleRestoreGitRepositoryWorkflow(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "upload")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveProjectNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;
  const resolvedWorkflow = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolvedWorkflow) return resolvedWorkflow.errorResponse;

  try {
    await restoreGitRepositoryWorkflow(resolved.projectName, resolvedWorkflow.workflowName);
    return Response.json({});
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
