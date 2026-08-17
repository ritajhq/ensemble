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
