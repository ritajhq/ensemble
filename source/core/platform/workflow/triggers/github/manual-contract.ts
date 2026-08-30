export interface ManualTriggerRequest {
  /** Tag name to simulate a push of, e.g. "1.2.3" — matched against the workflow's declared `on: - github: push: tags` patterns. Exactly one of "tag"/"branch" must be set. */
  tag?: string;
  /** Branch name to simulate a push of, e.g. "main" — matched against the workflow's declared `on: - github: push: branches` patterns. Exactly one of "tag"/"branch" must be set. */
  branch?: string;
  /** Commit SHA to report as the pushed commit. Optional — a real push always has one, but there's no real commit here. */
  sha?: string;
}

export interface ManualTriggerResponse {
  success: boolean;
}

export function isManualTriggerRequest(value: unknown): value is ManualTriggerRequest {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;

  const hasTag = typeof body.tag === "string" && body.tag.length > 0;
  const hasBranch = typeof body.branch === "string" && body.branch.length > 0;
  if (hasTag === hasBranch) return false; // exactly one of tag/branch
  if (body.sha !== undefined && typeof body.sha !== "string") return false;
  return true;
}
