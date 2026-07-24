export interface TriggerWorkflowRequest {
  name: string;
  /** Run only this job and its transitive dependencies. */
  job?: string;
  /** Max number of jobs to run concurrently within a batch. */
  concurrency?: number;
  /** Extra variables merged on top of the server's own env vars for this run. */
  variables?: Record<string, string>;
}

export interface TriggerWorkflowResponse {
  success: boolean;
}

export function isTriggerWorkflowRequest(value: unknown): value is TriggerWorkflowRequest {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;

  if (typeof body.name !== "string" || body.name.length === 0) return false;
  if (body.job !== undefined && typeof body.job !== "string") return false;
  if (body.concurrency !== undefined && (!Number.isInteger(body.concurrency) || (body.concurrency as number) <= 0)) {
    return false;
  }
  if (body.variables !== undefined) {
    if (typeof body.variables !== "object" || body.variables === null || Array.isArray(body.variables)) return false;
    if (Object.values(body.variables).some((v) => typeof v !== "string")) return false;
  }
  return true;
}
