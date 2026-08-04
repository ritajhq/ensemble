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
