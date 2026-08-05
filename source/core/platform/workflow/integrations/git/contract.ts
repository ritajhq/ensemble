export interface CloneGitWorkflowsRequest {
  repoUrl: string;
  /** Defaults to the repo URL's last path segment. */
  projectName?: string;
}

export function isCloneGitWorkflowsRequest(value: unknown): value is CloneGitWorkflowsRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.repoUrl !== "string" || record.repoUrl.trim().length === 0) return false;
  if (record.projectName !== undefined && typeof record.projectName !== "string") return false;
  return true;
}

export interface CloneGitWorkflowsResponse {
  projectName: string;
}

export interface GitWorkflowSummary {
  /** Workflow name relative to the project, e.g. "build" for workflows/<projectName>/build/workflow.yml. */
  name: string;
}

export interface GitRepositorySummary {
  projectName: string;
  repoUrl: string;
  clonedAt: string;
  workflows: GitWorkflowSummary[];
  removedWorkflows: string[];
}

export interface ListGitRepositoriesResponse {
  repositories: GitRepositorySummary[];
}

export interface RefreshGitRepositoryResponse {
  projectName: string;
  clonedAt: string;
}
