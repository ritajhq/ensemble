export interface WorkflowSummary {
  /** URL-safe id — use this (not `name`) when navigating to or fetching this workflow. */
  id: string;
  name: string;
  lastStatus?: string;
  lastRunAt?: string;
}

export interface RunRecord {
  runId: string;
  workflowName: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  jobs: Record<string, string>;
}

export interface WorkflowFileNode {
  path: string;
  type: "file" | "directory";
  children?: WorkflowFileNode[];
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

export async function fetchWorkflows(): Promise<WorkflowSummary[]> {
  const { workflows } = await getJson<{ workflows: WorkflowSummary[] }>("/v1/workflows");
  return workflows;
}

export async function fetchRuns(workflowId: string): Promise<RunRecord[]> {
  const { runs } = await getJson<{ runs: RunRecord[] }>(`/v1/workflows/${workflowId}/runs`);
  return runs;
}

export async function runWorkflow(workflowId: string): Promise<void> {
  await postJson(`/v1/workflows/${workflowId}/run`, {});
}

export async function fetchRunSteps(workflowId: string, runId: string): Promise<StepRecord[]> {
  const { steps } = await getJson<{ steps: StepRecord[] }>(`/v1/workflows/${workflowId}/runs/${runId}/steps`);
  return steps;
}

export async function fetchStepLog(workflowId: string, runId: string, jobId: string, index: number): Promise<StepLog> {
  return await getJson<StepLog>(
    `/v1/workflows/${workflowId}/runs/${runId}/steps/${encodeURIComponent(jobId)}/${index}/log`,
  );
}

export async function cloneGitWorkflows(repoUrl: string, projectName?: string): Promise<{ projectName: string }> {
  return await postJson<{ projectName: string }>("/v1/integrations/git/clone", { repoUrl, projectName });
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
