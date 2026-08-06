import { encodeWorkflowId } from "./workflow-id.ts";

export type ManualInputType = "string" | "number" | "boolean" | "object" | "git-tags" | "context" | "job";

export interface ManualInput {
  name: string;
  display?: string;
  type: ManualInputType;
  default?: unknown;
  /** Only set (and only meaningful) for type: "git-tags". */
  repository?: string;
  /** Only set (and only meaningful) for type: "job" — accept/require a list of job ids instead of one. */
  multiple?: boolean;
}

export interface WorkflowManualTriggerSummary {
  type: "manual";
  inputs: ManualInput[];
  /** This workflow's own job ids, for rendering a choice list for any `type: "job"` input. */
  jobs: string[];
}

export interface WorkflowGithubTriggerSummary {
  type: "github";
  /** Glob patterns a pushed tag must match, from this trigger's `push.tags`. */
  tagPatterns: string[];
}

export type WorkflowTriggerSummary = WorkflowManualTriggerSummary | WorkflowGithubTriggerSummary;

export interface WorkflowSummary {
  /** URL-safe id — use this (not `name`) when navigating to or fetching this workflow. */
  id: string;
  name: string;
  lastStatus?: string;
  lastRunAt?: string;
  /** This workflow's declared `on:` triggers, if any — empty when it only runs via direct invocation. */
  triggers: WorkflowTriggerSummary[];
}

export interface StepRecord {
  jobId: string;
  index: number;
  label: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  logTruncated?: boolean;
}

export interface RunRecord {
  runId: string;
  workflowName: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  jobs: Record<string, string>;
  /** Absent on RunRecords persisted before step tracking existed. */
  steps?: StepRecord[];
  trigger?: Record<string, unknown>;
}

export interface WorkflowFileNode {
  path: string;
  type: "file" | "directory";
  children?: WorkflowFileNode[];
}

export interface RunJobNode {
  id: string;
  /** Job ids this job's `needs:` declares — empty if it has none. */
  needs: string[];
}

export interface StepLog {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

const TOKEN_STORAGE_KEY = "ensemble_dashboard_token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function apiBase(): string {
  return globalThis.env.API_ENDPOINT ?? "";
}

async function getJson<T>(path: string): Promise<T> {
  const token = getToken();
  const response = await fetch(`${apiBase()}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return await response.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseBody = await response.json().catch(() => ({}));
    throw new Error(responseBody.error ?? `Request failed (${response.status})`);
  }
  return await response.json();
}

async function deleteJson<T>(path: string): Promise<T> {
  const token = getToken();
  const response = await fetch(`${apiBase()}${path}`, {
    method: "DELETE",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return await response.json();
}

export async function fetchWorkflows(): Promise<WorkflowSummary[]> {
  const { workflows } = await getJson<{ workflows: WorkflowSummary[] }>("/v1/workflows");
  return workflows;
}

export async function fetchRuns(workflowId: string): Promise<RunRecord[]> {
  const { runs } = await getJson<{ runs: RunRecord[] }>(`/v1/workflows/${workflowId}/runs`);
  return runs;
}

/** Runs a workflow's declared manual trigger, submitting values for its `on: - manual: inputs`. */
export async function triggerManualWorkflow(workflowId: string, inputs: Record<string, unknown>): Promise<void> {
  await postJson(`/v1/workflows/${workflowId}/trigger`, { inputs });
}

/** Runs a workflow's declared github trigger, simulating a tag push with hand-entered data. */
export async function triggerGithubWorkflow(workflowId: string, tag: string, sha?: string): Promise<void> {
  await postJson(`/v1/workflows/${workflowId}/trigger/github`, { tag, sha });
}

export interface RunSteps {
  steps: StepRecord[];
  /** Every job the workflow declares, for rendering its dependency graph regardless of run outcome. */
  jobs: RunJobNode[];
}

export async function fetchRunSteps(workflowId: string, runId: string): Promise<RunSteps> {
  return await getJson<RunSteps>(`/v1/workflows/${workflowId}/runs/${runId}/steps`);
}

/** Permanently deletes a run's record and its step logs. Allowed regardless of the run's status. */
export async function deleteRun(workflowId: string, runId: string): Promise<void> {
  await deleteJson(`/v1/workflows/${workflowId}/runs/${runId}`);
}

export async function fetchStepLog(workflowId: string, runId: string, jobId: string, index: number): Promise<StepLog> {
  return await getJson<StepLog>(
    `/v1/workflows/${workflowId}/runs/${runId}/steps/${encodeURIComponent(jobId)}/${index}/log`,
  );
}

/**
 * Subscribes to live status updates for a run. `EventSource` can't send the
 * dashboard's Authorization header, so this first exchanges it for a
 * short-lived cookie (via /v1/auth/sse-token) before opening the stream —
 * see auth/tokens.ts's isAuthorizedFor on the server for the matching read
 * side. Returns a cleanup function that closes the connection; safe to call
 * even if the mint request is still in flight or failed.
 */
export function openRunEvents(
  workflowId: string,
  runId: string,
  onUpdate: (run: RunRecord) => void,
): () => void {
  let source: EventSource | undefined;
  let cancelled = false;

  postJson("/v1/auth/sse-token", {}).then(() => {
    if (cancelled) return;
    source = new EventSource(`${apiBase()}/v1/workflows/${workflowId}/runs/${runId}/events`, {
      withCredentials: true,
    });
    source.onmessage = (event) => {
      onUpdate(JSON.parse(event.data));
    };
  }).catch((error) => {
    console.error("Failed to open live run updates:", error);
  });

  return () => {
    cancelled = true;
    source?.close();
  };
}

export async function cloneGitWorkflows(repoUrl: string, projectName?: string): Promise<{ projectName: string }> {
  return await postJson<{ projectName: string }>("/v1/integrations/git/clone", { repoUrl, projectName });
}

export interface GitWorkflowSummary {
  name: string;
}

export interface GitRepositorySummary {
  projectName: string;
  repoUrl: string;
  clonedAt: string;
  workflows: GitWorkflowSummary[];
  removedWorkflows: string[];
}

export async function fetchGitRepositories(): Promise<GitRepositorySummary[]> {
  const { repositories } = await getJson<{ repositories: GitRepositorySummary[] }>("/v1/integrations/git/repositories");
  return repositories;
}

export async function refreshGitRepository(projectName: string): Promise<void> {
  await postJson(`/v1/integrations/git/repositories/${encodeURIComponent(projectName)}/refresh`, {});
}

export async function removeGitRepository(projectName: string): Promise<void> {
  await postJson(`/v1/integrations/git/repositories/${encodeURIComponent(projectName)}/remove`, {});
}

export async function removeGitRepositoryWorkflow(projectName: string, workflowName: string): Promise<void> {
  await postJson(
    `/v1/integrations/git/repositories/${encodeURIComponent(projectName)}/workflows/${encodeWorkflowId(workflowName)}/remove`,
    {},
  );
}

export async function restoreGitRepositoryWorkflow(projectName: string, workflowName: string): Promise<void> {
  await postJson(
    `/v1/integrations/git/repositories/${encodeURIComponent(projectName)}/workflows/${encodeWorkflowId(workflowName)}/restore`,
    {},
  );
}

export async function fetchWorkflowFiles(workflowId: string): Promise<WorkflowFileNode[]> {
  const { files } = await getJson<{ files: WorkflowFileNode[] }>(`/v1/workflows/${workflowId}/files`);
  return files;
}

export async function fetchWorkflowFileContent(workflowId: string, path: string): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const { content } = await getJson<{ content: string }>(
    `/v1/workflows/${workflowId}/files/${encodedPath}`,
  );
  return content;
}
