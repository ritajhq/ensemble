export interface HttpTriggerRequest {
  /** Run only this job and its transitive dependencies. */
  job?: string;
  /** Max number of jobs to run concurrently within a batch. */
  concurrency?: number;
  /** Extra variables merged on top of the server's own env vars for this run. */
  variables?: Record<string, string>;
  /** Deploy context name, resolved server-side into context.name/context.path (see RunWorkflowByNameOptions.context). */
  context?: string;
  /** Arbitrary caller payload, extracted into trigger.* per the workflow's own on: - http: payload mapping. */
  payload?: unknown;
}

export interface HttpTriggerResponse {
  success: boolean;
}

export function isHttpTriggerRequest(value: unknown): value is HttpTriggerRequest {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;

  if (body.job !== undefined && typeof body.job !== "string") return false;
  if (body.concurrency !== undefined && (!Number.isInteger(body.concurrency) || (body.concurrency as number) <= 0)) {
    return false;
  }
  if (body.variables !== undefined) {
    if (typeof body.variables !== "object" || body.variables === null || Array.isArray(body.variables)) return false;
    if (Object.values(body.variables).some((v) => typeof v !== "string")) return false;
  }
  if (body.context !== undefined && typeof body.context !== "string") return false;
  return true;
}
