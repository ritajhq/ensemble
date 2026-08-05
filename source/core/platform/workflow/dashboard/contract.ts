import type { JobStatus, RunRecord, RunStatus, StepLog, StepRecord, WorkflowFileNode } from "@ensemble/core";
import type { ManualInput } from "@ensemble/workflow";

export interface WorkflowManualTriggerSummary {
  type: "manual";
  inputs: ManualInput[];
}

export interface WorkflowGithubTriggerSummary {
  type: "github";
  /** Glob patterns a pushed tag must match, from this trigger's `push.tags`. */
  tagPatterns: string[];
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
}

export interface ListWorkflowsResponse {
  workflows: WorkflowSummary[];
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
