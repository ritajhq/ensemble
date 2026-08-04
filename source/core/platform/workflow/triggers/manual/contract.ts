export interface ManualTriggerRequest {
  /** Run only this job and its transitive dependencies. */
  job?: string;
  /** Max number of jobs to run concurrently within a batch. */
  concurrency?: number;
  /** Extra variables merged on top of the server's own env vars for this run. */
  variables?: Record<string, string>;
  /** Deploy context name, resolved server-side into context.name/context.path (see RunWorkflowByNameOptions.context). */
  context?: string;
  /** Values for the workflow's declared `on: - manual: inputs`, read by name and exposed as `trigger.<name>`. */
  inputs?: Record<string, unknown>;
}

export interface ManualTriggerResponse {
  success: boolean;
}

export function isManualTriggerRequest(value: unknown): value is ManualTriggerRequest {
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
  if (body.inputs !== undefined) {
    if (typeof body.inputs !== "object" || body.inputs === null || Array.isArray(body.inputs)) return false;
  }
  return true;
}
