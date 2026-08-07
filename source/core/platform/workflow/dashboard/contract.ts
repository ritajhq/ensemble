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
}

/** One entry of a workflow's `on:` list, as shown/used by the dashboard. */
export type WorkflowTriggerSummary = WorkflowManualTriggerSummary | WorkflowGithubTriggerSummary;

/** A workflow's declared `contexts:`, as shown/used by the dashboard — just enough for a UI to offer a picker, not the resolved contents. */
export interface WorkflowContextsSummary {
  /** Names of every entry under `contexts.entries`. */
  names: string[];
  /** `contexts.default`, if set — the name a UI should preselect. */
  defaultName?: string;
}

export interface WorkflowSummary {
  /** URL-safe id — use this (not `name`) when building a route/API path for this workflow. */
  id: string;
  name: string;
  lastStatus?: RunStatus;
  lastRunAt?: string;
  /** This workflow's declared `on:` triggers, if any — empty when it only runs via direct invocation. */
  triggers: WorkflowTriggerSummary[];
  /** This workflow's declared `contexts:`, if any — absent when it declares none (no --context required or offered). */
  contexts?: WorkflowContextsSummary;
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

export interface DeleteRunResponse {
  success: boolean;
}

export interface MintSseTokenResponse {
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
