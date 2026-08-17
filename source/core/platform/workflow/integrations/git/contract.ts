/** How the server should authenticate to a registered repository. Discriminated union — extensible with new strategies (e.g. a future GitHub App installation) without a schema migration. */
export type GitAuthStrategyRequest =
  | { type: "none" }
  | { type: "pat"; token: string };

export function isGitAuthStrategyRequest(
  value: unknown,
): value is GitAuthStrategyRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.type === "none") return true;
  if (record.type === "pat") {
    return typeof record.token === "string" && record.token.length > 0;
  }
  return false;
}

export interface RegisterGitRepositoryRequest {
  repoUrl: string;
  /** Defaults to the repo URL's last path segment. */
  projectName?: string;
  /** Defaults to { type: "none" } (public repo, no credentials). */
  auth?: GitAuthStrategyRequest;
  /** This repo's X25519 private key (base64 pkcs8 — the content of its .ensemble/secrets.key), so a workflow linked to this repo can decrypt its context.secrets when triggered here. Optional — omit for a repo with no encrypted secrets. Can also be set/rotated later via the dedicated secrets-key endpoint without re-registering. */
  secretsKey?: string;
}

export function isRegisterGitRepositoryRequest(
  value: unknown,
): value is RegisterGitRepositoryRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.repoUrl !== "string" || record.repoUrl.trim().length === 0
  ) return false;
  if (
    record.projectName !== undefined && typeof record.projectName !== "string"
  ) return false;
  if (record.auth !== undefined && !isGitAuthStrategyRequest(record.auth)) {
    return false;
  }
  if (
    record.secretsKey !== undefined && typeof record.secretsKey !== "string"
  ) return false;
  return true;
}

export interface RegisterGitRepositoryResponse {
  projectName: string;
}

export interface SetRepositorySecretsKeyRequest {
  secretsKey: string;
}

export function isSetRepositorySecretsKeyRequest(
  value: unknown,
): value is SetRepositorySecretsKeyRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.secretsKey === "string" && record.secretsKey.length > 0;
}

export interface SetRepositoryAuthRequest {
  auth: GitAuthStrategyRequest;
}

export function isSetRepositoryAuthRequest(
  value: unknown,
): value is SetRepositoryAuthRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return isGitAuthStrategyRequest(record.auth);
}

export interface SetRepositoryAuthResponse {
  projectName: string;
  authType: "none" | "pat";
}

export interface GitRepositorySummary {
  projectName: string;
  repoUrl: string;
  /** "none" | "pat" — never the token itself. */
  authType: "none" | "pat";
  registeredAt: string;
  lastFetchedAt?: string;
  /** Whether a secrets private key is currently set — never the key itself. */
  hasSecretsKey: boolean;
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
