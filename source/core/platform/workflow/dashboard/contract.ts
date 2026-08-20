import type { JobStatus, RunRecord, RunStatus, StepLog, StepRecord, WorkflowFileNode } from "@ensemble/core";
import type { ManualInput } from "@ensemble/workflow";

export interface WorkflowManualTriggerSummary {
  type: "manual";
  inputs: ManualInput[];
  /** This workflow's own job ids, for a UI to offer as choices for any `type: "job"` input. Empty when none of `inputs` needs it. */
  jobs: string[];
}

export interface WorkflowGithubTriggerSummary {
  type: "github";
  /** Glob patterns a pushed tag must match, from this trigger's `push.tags`. */
  tagPatterns: string[];
  /** Deploy context a matching tag push resolves to, if this entry declares one. */
  context?: string;
}

/** One entry of a workflow's `on:` list, as shown/used by the dashboard. */
export type WorkflowTriggerSummary = WorkflowManualTriggerSummary | WorkflowGithubTriggerSummary;

export interface WorkflowSummary {
  /** URL-safe id — use this (not `name`) when building a route/API path for this workflow. */
  id: string;
  name: string;
  lastStatus?: RunStatus;
  lastRunAt?: string;
  /** This workflow's declared `on:` triggers, if any — empty when it only runs via direct invocation. */
  triggers: WorkflowTriggerSummary[];
  /** Context names available to this workflow — one per subdirectory of its own contexts/, for a UI to offer as a --context picker. Empty when it has no contexts/ directory. */
  contexts: string[];
}

export interface ListWorkflowsResponse {
  workflows: WorkflowSummary[];
}

export interface GetWorkflowResponse {
  workflow: WorkflowSummary;
}

/** Where a new workflow's initial content comes from, if not the default empty stub. */
export interface CreateWorkflowGitSourceRequest {
  projectName: string;
  pathInRepo: string;
}

export interface CreateWorkflowRequest {
  name: string;
  /** Seeds the workflow from a registered repo's own workflows/<pathInRepo> instead of the default empty stub — the workflow keeps auto-resyncing from there on future triggers. */
  source?: CreateWorkflowGitSourceRequest;
}

function isCreateWorkflowGitSourceRequest(value: unknown): value is CreateWorkflowGitSourceRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.projectName === "string" && record.projectName.trim().length > 0 &&
    typeof record.pathInRepo === "string" && record.pathInRepo.trim().length > 0;
}

export function isCreateWorkflowRequest(value: unknown): value is CreateWorkflowRequest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.trim().length === 0) return false;
  if (record.source !== undefined && !isCreateWorkflowGitSourceRequest(record.source)) return false;
  return true;
}

export interface CreateWorkflowResponse {
  workflow: WorkflowSummary;
}

export interface DeleteWorkflowResponse {
  success: boolean;
}

export interface ListRunsResponse {
  runs: RunRecord[];
}

export interface ListWorkflowFilesResponse {
  files: WorkflowFileNode[];
}

export interface ReadWorkflowFileResponse {
  content: string;
}

export interface RunWorkflowResponse {
  success: boolean;
}

export interface DeleteRunResponse {
  success: boolean;
}

export interface MintWsTokenResponse {
  ok: true;
}

export interface RunJobNode {
  id: string;
  /** Job ids this job's `needs:` declares — empty if it has none. */
  needs: string[];
}

export interface ListRunStepsResponse {
  steps: StepRecord[];
  /** Every job the workflow declares (not just ones this run happened to touch), for rendering its dependency graph regardless of run outcome. */
  jobs: RunJobNode[];
}

export interface GetStepLogResponse {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export type { JobStatus, RunRecord, RunStatus, StepLog, StepRecord, WorkflowFileNode };
