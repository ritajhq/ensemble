/** How the server should authenticate to a registered repository. Discriminated union — extensible with new strategies (e.g. a future GitHub App installation) without a schema migration. */
export type GitAuthStrategyRequest =
  | { type: "none" }
  | { type: "pat"; token: string };

function isGitAuthStrategyRequest(value: unknown): value is GitAuthStrategyRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.type === "none") return true;
  if (record.type === "pat") return typeof record.token === "string" && record.token.length > 0;
  return false;
}

export interface RegisterGitRepositoryRequest {
  repoUrl: string;
  /** Defaults to the repo URL's last path segment. */
  projectName?: string;
  /** Defaults to { type: "none" } (public repo, no credentials). */
  auth?: GitAuthStrategyRequest;
}

export function isRegisterGitRepositoryRequest(value: unknown): value is RegisterGitRepositoryRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.repoUrl !== "string" || record.repoUrl.trim().length === 0) return false;
  if (record.projectName !== undefined && typeof record.projectName !== "string") return false;
  if (record.auth !== undefined && !isGitAuthStrategyRequest(record.auth)) return false;
  return true;
}

export interface RegisterGitRepositoryResponse {
  projectName: string;
}

export interface GitRepositorySummary {
  projectName: string;
  repoUrl: string;
  /** "none" | "pat" — never the token itself. */
  authType: "none" | "pat";
  registeredAt: string;
  lastFetchedAt?: string;
}

export interface ListGitRepositoriesResponse {
  repositories: GitRepositorySummary[];
}

export interface RefreshGitRepositoryResponse {
  projectName: string;
  lastFetchedAt?: string;
}

export interface RepoWorkflowCandidateSummary {
  pathInRepo: string;
  hasTrigger: boolean;
}

export interface ListRepoWorkflowCandidatesResponse {
  candidates: RepoWorkflowCandidateSummary[];
}
