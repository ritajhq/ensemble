/**
 * The exact error message returned when a workflow's linked repository has
 * no write-scoped PAT — the secrets editor needs one to commit on your
 * behalf (see @ensemble/core's GitWriteProvider). Shared here so the web
 * client can recognize this specific, actionable case (show a "needs a PAT"
 * empty state, not a generic error banner) without fragile string-matching
 * against handler.ts's own copy of the message.
 */
export function noWriteAccessMessage(workflowName: string): string {
  return `Repository "${workflowName}" isn't registered with a write-scoped personal access token — the secrets editor needs one to commit on your behalf. Add one under Git integrations.`;
}

export interface SecretKeySummary {
  key: string;
}

export interface SecretsContextSummaryResponse {
  /** Key names only — never a value, matching the dashboard's git integration principle of never round-tripping a stored secret. */
  keys: SecretKeySummary[];
}

export interface SetSecretRequest {
  value: string;
}

export function isSetSecretRequest(value: unknown): value is SetSecretRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.value === "string";
}

export interface SetSecretResponse {
  commitSha: string;
}
