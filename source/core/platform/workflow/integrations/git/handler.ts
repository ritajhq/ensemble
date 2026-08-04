import { cloneWorkflowsFromGit } from "@ensemble/core";
import { isAuthorizedFor } from "../../../auth/tokens.ts";
import { type CloneGitWorkflowsResponse, isCloneGitWorkflowsRequest } from "./contract.ts";

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
