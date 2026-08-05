export interface ManualGithubTriggerRequest {
  /** Tag name to simulate a push of, e.g. "1.2.3" — matched against the workflow's declared `on: - github: push: tags` patterns. */
  tag: string;
  /** Commit SHA to report as the pushed commit. Optional — a real push always has one, but there's no real commit here. */
  sha?: string;
}

export interface ManualGithubTriggerResponse {
  success: boolean;
}

export function isManualGithubTriggerRequest(value: unknown): value is ManualGithubTriggerRequest {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;

  if (typeof body.tag !== "string" || body.tag.length === 0) return false;
  if (body.sha !== undefined && typeof body.sha !== "string") return false;
  return true;
}
