import * as Core from "@ensemble/core";

/** Where a git-linked workflow's declared files live in its linked repository. */
export interface WorkflowGitTarget {
  repoUrl: string;
  auth: Core.GitRepositories.GitAuthStrategy;
  /** The workflow's own directory within the repo, e.g. "workflows/deploy". */
  workflowRoot: string;
  workflowYmlPath: string;
}

/** Reads/validates the common :workflowId/:context route params, decoding the base64url workflow id to its real name. Shared by the secrets editor and the read-only context-values view. */
export function resolveContextParams(
  params: Record<string, string | undefined>,
): { workflowName: string; context: string } | { errorResponse: Response } {
  const id = params.workflowId;
  const context = params.context;
  if (!id || !context) {
    return {
      errorResponse: Response.json({
        error: "Missing workflowId or context in URL.",
      }, { status: 400 }),
    };
  }
  try {
    return { workflowName: Core.Workflows.decodeWorkflowId(id), context };
  } catch (error) {
    return {
      errorResponse: Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 }),
    };
  }
}

/**
 * Resolves the git repo a workflow's WorkflowGitLink points at, or an error
 * Response if it has none — only git-linked workflows expose a working
 * dashboard secrets/context-values view (a local-only workflow's secrets are
 * edited via `ens workflow secrets edit` instead, see apps/cli/commands/workflow.ts).
 */
export async function resolveWorkflowGitTarget(
  repositories: Core.GitRepositories.GitRepositoryStore,
  links: Core.GitRepositories.WorkflowGitLinkStore,
  workflowName: string,
): Promise<WorkflowGitTarget | { errorResponse: Response }> {
  const link = await links.get(workflowName);
  if (!link) {
    return {
      errorResponse: Response.json({
        error:
          `Workflow "${workflowName}" isn't linked to a git repository — edit its secrets locally via "ens workflow secrets edit".`,
      }, { status: 404 }),
    };
  }
  const record = await repositories.get(link.projectName);
  if (!record) {
    return {
      errorResponse: Response.json({
        error: `Registered repository "${link.projectName}" not found.`,
      }, { status: 404 }),
    };
  }
  const workflowRoot = `workflows/${link.pathInRepo}`;
  return {
    repoUrl: record.repoUrl,
    auth: record.auth,
    workflowRoot,
    workflowYmlPath: `${workflowRoot}/workflow.yml`,
  };
}
