import type { JobStatus, RunRecord, RunStatus, StepLog, StepRecord, WorkflowFileNode } from "@ensemble/core";

export interface WorkflowSummary {
  /** URL-safe id — use this (not `name`) when building a route/API path for this workflow. */
  id: string;
  name: string;
  lastStatus?: RunStatus;
  lastRunAt?: string;
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

export interface ListRunStepsResponse {
  steps: StepRecord[];
}

export interface GetStepLogResponse {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export type { JobStatus, RunRecord, RunStatus, StepLog, StepRecord, WorkflowFileNode };
