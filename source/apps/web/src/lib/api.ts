export type ManualInputType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "git-tags"
  | "context"
  | "job";

export interface ManualInput {
  name: string;
  display?: string;
  type: ManualInputType;
  default?: unknown;
  /** Only set (and only meaningful) for type: "git-tags". */
  repository?: string;
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
  /** Deploy context a matching tag push resolves to, if this entry declares one. */
  context?: string;
}

export type WorkflowTriggerSummary =
  | WorkflowManualTriggerSummary
  | WorkflowGithubTriggerSummary;

export interface WorkflowSummary {
  /** URL-safe id — use this (not `name`) when navigating to or fetching this workflow. */
  id: string;
  name: string;
  lastStatus?: string;
  lastRunAt?: string;
  /** This workflow's declared `on:` triggers, if any — empty when it only runs via direct invocation. */
  triggers: WorkflowTriggerSummary[];
  /** Context names available to this workflow (one per contexts/<name> subdirectory) — offer as a --context picker when non-empty. */
  contexts: string[];
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
  /** The resolved deploy context this run executed under, if any. */
  context?: string;
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
    throw new Error(
      responseBody.error ?? `Request failed (${response.status})`,
    );
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
  const { workflows } = await getJson<{ workflows: WorkflowSummary[] }>(
    "/v1/workflows",
  );
  return workflows;
}

export async function fetchRuns(workflowId: string): Promise<RunRecord[]> {
  const { runs } = await getJson<{ runs: RunRecord[] }>(
    `/v1/workflows/${workflowId}/runs`,
  );
  return runs;
}

/**
 * Runs a workflow's declared manual trigger, submitting values for its
 * `on: - manual: inputs` and, separately, an optional deploy context name
 * (unrelated to `inputs` — resolved server-side against this workflow's
 * declared `context.variables`/`context.secrets`, not `trigger.*`).
 */
export async function triggerManualWorkflow(
  workflowId: string,
  inputs: Record<string, unknown>,
  context?: string,
): Promise<void> {
  await postJson(`/v1/workflows/${workflowId}/trigger`, { inputs, context });
}

/** Runs a workflow's declared github trigger, simulating a tag push with hand-entered data. */
export async function triggerGithubWorkflow(
  workflowId: string,
  tag: string,
  sha?: string,
): Promise<void> {
  await postJson(`/v1/workflows/${workflowId}/trigger/github`, { tag, sha });
}

export interface RunSteps {
  steps: StepRecord[];
  /** Every job the workflow declares, for rendering its dependency graph regardless of run outcome. */
  jobs: RunJobNode[];
}

export async function fetchRunSteps(
  workflowId: string,
  runId: string,
): Promise<RunSteps> {
  return await getJson<RunSteps>(
    `/v1/workflows/${workflowId}/runs/${runId}/steps`,
  );
}

/** Permanently deletes a run's record and its step logs. Allowed regardless of the run's status. */
export async function deleteRun(
  workflowId: string,
  runId: string,
): Promise<void> {
  await deleteJson(`/v1/workflows/${workflowId}/runs/${runId}`);
}

export async function fetchStepLog(
  workflowId: string,
  runId: string,
  jobId: string,
  index: number,
): Promise<StepLog> {
  return await getJson<StepLog>(
    `/v1/workflows/${workflowId}/runs/${runId}/steps/${
      encodeURIComponent(jobId)
    }/${index}/log`,
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
    source = new EventSource(
      `${apiBase()}/v1/workflows/${workflowId}/runs/${runId}/events`,
      {
        withCredentials: true,
      },
    );
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

/** How the server should authenticate to a registered repository. Discriminated union — extensible for a future strategy (e.g. a GitHub App installation) without a schema change. */
export type GitAuthStrategy =
  | { type: "none" }
  | { type: "pat"; token: string };

/** Registers a git repository: validates access by cloning it into a server-side cache — never creates or touches any workflow directory. `secretsKey` (this repo's X25519 private key, the content of its .ensemble/secrets.key) is optional — lets workflows linked to this repo decrypt their context.secrets when triggered here. */
export async function registerGitRepository(
  repoUrl: string,
  projectName?: string,
  auth?: GitAuthStrategy,
  secretsKey?: string,
): Promise<{ projectName: string }> {
  return await postJson<{ projectName: string }>(
    "/v1/integrations/git/register",
    { repoUrl, projectName, auth, secretsKey },
  );
}

export interface GitRepositorySummary {
  projectName: string;
  repoUrl: string;
  /** "none" | "pat" — never the credential itself. */
  authType: "none" | "pat";
  registeredAt: string;
  lastFetchedAt?: string;
  /** Whether a secrets private key is currently set — never the key itself. */
  hasSecretsKey: boolean;
}

export async function fetchGitRepositories(): Promise<GitRepositorySummary[]> {
  const { repositories } = await getJson<
    { repositories: GitRepositorySummary[] }
  >("/v1/integrations/git/repositories");
  return repositories;
}

/** Sets or rotates an already-registered repository's secrets private key, without re-registering. */
export async function setRepositorySecretsKey(
  projectName: string,
  secretsKey: string,
): Promise<void> {
  await postJson(
    `/v1/integrations/git/repositories/${
      encodeURIComponent(projectName)
    }/secrets-key`,
    { secretsKey },
  );
}

/** Updates an already-registered repository's access credentials (public or a PAT), re-validating clone access before persisting. repoUrl/projectName aren't changeable here — remove and re-register to point at a different URL. */
export async function setRepositoryAuth(
  projectName: string,
  auth: GitAuthStrategy,
): Promise<{ projectName: string; authType: "none" | "pat" }> {
  return await postJson<{ projectName: string; authType: "none" | "pat" }>(
    `/v1/integrations/git/repositories/${
      encodeURIComponent(projectName)
    }/auth`,
    { auth },
  );
}

/** Re-fetches a registered repository's cached checkout. Does not touch any workflow. */
export async function refreshGitRepository(projectName: string): Promise<void> {
  await postJson(
    `/v1/integrations/git/repositories/${
      encodeURIComponent(projectName)
    }/refresh`,
    {},
  );
}

/** Unregisters a repository. Workflows previously synced from it keep their last-synced content. */
export async function removeGitRepository(projectName: string): Promise<void> {
  await postJson(
    `/v1/integrations/git/repositories/${
      encodeURIComponent(projectName)
    }/remove`,
    {},
  );
}

export interface RepoWorkflowCandidate {
  pathInRepo: string;
  hasTrigger: boolean;
}

/** Every workflow.yml found in a registered repo's own workflows/ folder, for a "sync from git" picker. */
export async function fetchRepoWorkflowCandidates(
  projectName: string,
): Promise<RepoWorkflowCandidate[]> {
  const { candidates } = await getJson<{ candidates: RepoWorkflowCandidate[] }>(
    `/v1/integrations/git/repositories/${
      encodeURIComponent(projectName)
    }/candidates`,
  );
  return candidates;
}

/** Where a new workflow's initial content comes from, if not the default empty stub. */
export interface CreateWorkflowGitSource {
  projectName: string;
  pathInRepo: string;
}

/**
 * Creates a new workflow. With no `source`, a minimal empty stub (no trigger
 * yet). With `source`, seeds it from a registered repo's own
 * workflows/<pathInRepo> instead — it keeps auto-resyncing from there on
 * future triggers.
 */
export async function createWorkflow(
  name: string,
  source?: CreateWorkflowGitSource,
): Promise<WorkflowSummary> {
  const { workflow } = await postJson<{ workflow: WorkflowSummary }>(
    "/v1/workflows",
    { name, source },
  );
  return workflow;
}

/** Permanently deletes a workflow's directory and drops any git link it has. */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  await deleteJson(`/v1/workflows/${workflowId}`);
}

export async function fetchWorkflowFiles(
  workflowId: string,
): Promise<WorkflowFileNode[]> {
  const { files } = await getJson<{ files: WorkflowFileNode[] }>(
    `/v1/workflows/${workflowId}/files`,
  );
  return files;
}

export async function fetchWorkflowFileContent(
  workflowId: string,
  path: string,
): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const { content } = await getJson<{ content: string }>(
    `/v1/workflows/${workflowId}/files/${encodedPath}`,
  );
  return content;
}

export interface SecretKeySummary {
  key: string;
}

/** One declared context.secrets.files entry and whether it currently has an encrypted <path>.enc committed. */
export interface SecretFileSummary {
  name: string;
  isSet: boolean;
}

export interface SecretsContextSummary {
  keys: SecretKeySummary[];
  files: SecretFileSummary[];
}

/**
 * Value-secret key names (never a value) and declared file-secret names
 * (with set/unset state, never content) for one (workflow, context) —
 * matching the git integration's own "never round-trip a stored secret"
 * principle. 404s (surfaced as a thrown error whose message names the
 * reason) when the workflow has no linked git repository — the secrets
 * editor only works for git-linked workflows; a local-only workflow is
 * edited via `ens workflow secrets edit` instead.
 */
export async function fetchSecretsContext(
  workflowId: string,
  context: string,
): Promise<SecretsContextSummary> {
  return await getJson<SecretsContextSummary>(
    `/v1/secrets/${workflowId}/${encodeURIComponent(context)}`,
  );
}

/** Encrypts `value` with the linked repo's own committed public key and commits contexts/<context>/secrets.yml. Returns the new commit's sha. */
export async function setSecret(
  workflowId: string,
  context: string,
  key: string,
  value: string,
): Promise<string> {
  const { commitSha } = await postJson<{ commitSha: string }>(
    `/v1/secrets/${workflowId}/${encodeURIComponent(context)}/${
      encodeURIComponent(key)
    }/set`,
    { value },
  );
  return commitSha;
}

export async function deleteSecret(
  workflowId: string,
  context: string,
  key: string,
): Promise<void> {
  await postJson(
    `/v1/secrets/${workflowId}/${encodeURIComponent(context)}/${
      encodeURIComponent(key)
    }/delete`,
    {},
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Encrypts `file`'s bytes with the linked repo's own committed public key and commits it to contexts/<context>/secrets/<declared path>.enc. `name` must match a context.secrets.files entry the workflow already declares. Returns the new commit's sha. */
export async function setSecretFile(
  workflowId: string,
  context: string,
  name: string,
  file: File,
): Promise<string> {
  const contentBase64 = await fileToBase64(file);
  const { commitSha } = await postJson<{ commitSha: string }>(
    `/v1/secrets/${workflowId}/${encodeURIComponent(context)}/${
      encodeURIComponent(name)
    }/set-file`,
    { contentBase64 },
  );
  return commitSha;
}

export async function deleteSecretFile(
  workflowId: string,
  context: string,
  name: string,
): Promise<void> {
  await postJson(
    `/v1/secrets/${workflowId}/${encodeURIComponent(context)}/${
      encodeURIComponent(name)
    }/delete-file`,
    {},
  );
}

export interface ContextVariableSummary {
  name: string;
  /** Resolved from contexts/<context>/variables.yml, or workflow.yml's own inline `value`/`default` — absent if unresolved. */
  value?: string;
}

/** One declared context.files entry and its committed path. */
export interface ContextFileSummary {
  name: string;
  path: string;
}

export interface ContextValuesSummary {
  variables: ContextVariableSummary[];
  files: ContextFileSummary[];
}

/** Plain (non-secret) context.variables/context.files for one (workflow, context) — actual values, unlike fetchSecretsContext. Same git-link gating as secrets: 404s when the workflow has no linked git repository. */
export async function fetchContextValues(
  workflowId: string,
  context: string,
): Promise<ContextValuesSummary> {
  return await getJson<ContextValuesSummary>(
    `/v1/context-values/${workflowId}/${encodeURIComponent(context)}`,
  );
}
