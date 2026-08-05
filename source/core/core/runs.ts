import { Delegate } from "@ritaj/event";
import type {
  JobResult,
  RunWorkflowResult,
  StepLogCapture,
  StepResult,
  WorkflowEvent,
} from "@ensemble/workflow";
import { findRepoRoot } from "./repo.ts";

export type RunStatus = "pending" | "in_progress" | "succeeded" | "failed";
export type JobStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";
export type StepStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "skipped";

export interface StepRecord {
  jobId: string;
  index: number;
  label: string;
  status: StepStatus;
  startedAt: string;
  finishedAt?: string;
  logTruncated?: boolean;
}

export interface RunRecord {
  runId: string;
  workflowName: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  jobs: Record<string, JobStatus>;
  /** Optional: absent on RunRecords persisted before step tracking existed. */
  steps?: StepRecord[];
  /** Data the trigger that started this run supplied (e.g. `{type:"manual",...}`, `{type:"github",...}`), if any. */
  trigger?: Record<string, unknown>;
}

export interface StepLog {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

function mapJobResult(result: JobResult): JobStatus {
  if (result === "success") return "succeeded";
  if (result === "failure") return "failed";
  return result;
}

function mapStepResult(result: StepResult): StepStatus {
  if (result === "success") return "succeeded";
  if (result === "failure") return "failed";
  return result;
}

let kvPromise: Promise<Deno.Kv> | undefined;

function getKv(): Promise<Deno.Kv> {
  if (!kvPromise) {
    kvPromise = (async () => {
      const repoRoot = await findRepoRoot();
      return await Deno.openKv(`${repoRoot}/.ensemble/platform/runs.kv`);
    })();
  }
  return kvPromise;
}

/**
 * Newest-first ordering falls out of a plain prefix scan by inverting the
 * timestamp in the key, rather than relying on `list()`'s `reverse` option.
 */
function invertedTimestamp(ms: number): string {
  return (Number.MAX_SAFE_INTEGER - ms).toString().padStart(16, "0");
}

async function putRun(record: RunRecord): Promise<void> {
  const kv = await getKv();
  const key = [
    "runs",
    record.workflowName,
    invertedTimestamp(new Date(record.startedAt).getTime()),
    record.runId,
  ];
  await kv.atomic()
    .set(key, record)
    .set(["runs-latest", record.workflowName], record)
    .set(["runs-by-id", record.runId], record)
    .commit();
}

/** All runs for a workflow, newest first. */
export async function listRunsForWorkflow(
  workflowName: string,
): Promise<RunRecord[]> {
  const kv = await getKv();
  const out: RunRecord[] = [];
  for await (
    const entry of kv.list<RunRecord>({ prefix: ["runs", workflowName] })
  ) {
    out.push(entry.value);
  }
  return out;
}

/** The most recent run for a workflow, including one still in progress. */
export async function getLatestRun(
  workflowName: string,
): Promise<RunRecord | undefined> {
  const kv = await getKv();
  const entry = await kv.get<RunRecord>(["runs-latest", workflowName]);
  return entry.value ?? undefined;
}

/**
 * A specific run's step records (across all its jobs), or undefined if the
 * run id is unknown or doesn't belong to `workflowName` — scoping by
 * workflow name (not just runId) keeps this consistent with
 * `listRunsForWorkflow`'s scoping and stops a caller from fetching another
 * workflow's run just by guessing/reusing a runId.
 */
export async function getRunSteps(
  runId: string,
  workflowName: string,
): Promise<StepRecord[] | undefined> {
  const kv = await getKv();
  const entry = await kv.get<RunRecord>(["runs-by-id", runId]);
  if (!entry.value || entry.value.workflowName !== workflowName) {
    return undefined;
  }
  return entry.value.steps ?? [];
}

async function putStepLog(
  runId: string,
  jobId: string,
  index: number,
  log: StepLog,
): Promise<void> {
  const kv = await getKv();
  await kv.set(["run-logs", runId, jobId, index], log);
}

/** A specific step's captured stdout/stderr, or undefined if no log was recorded for it or the run doesn't belong to `workflowName`. */
export async function getStepLog(
  runId: string,
  jobId: string,
  index: number,
  workflowName: string,
): Promise<StepLog | undefined> {
  const kv = await getKv();
  const runEntry = await kv.get<RunRecord>(["runs-by-id", runId]);
  if (!runEntry.value || runEntry.value.workflowName !== workflowName) {
    return undefined;
  }
  const entry = await kv.get<StepLog>(["run-logs", runId, jobId, index]);
  return entry.value ?? undefined;
}

/**
 * Runs `run` while tracking its progress in Deno KV, keyed by a fresh run id.
 * `run` is handed a `Delegate` to pass through as `RunWorkflowOptions.events`
 * — job-started/job-finished notifications update the run's job-status map
 * and persist on every change, so "in_progress" is visible to readers for
 * the whole run duration, not just at the end.
 */
export async function trackedRunWorkflow(
  workflowName: string,
  trigger: Record<string, unknown> | undefined,
  run: (events: Delegate<[WorkflowEvent]>) => Promise<RunWorkflowResult>,
): Promise<boolean> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const jobs: Record<string, JobStatus> = {};
  const steps: StepRecord[] = [];
  const events = new Delegate<[WorkflowEvent]>();

  function findOrCreateStep(
    jobId: string,
    index: number,
    label: string,
  ): StepRecord {
    let step = steps.find((s) => s.jobId === jobId && s.index === index);
    if (!step) {
      step = {
        jobId,
        index,
        label,
        status: "pending",
        startedAt: new Date().toISOString(),
      };
      steps.push(step);
    }
    return step;
  }

  events.Do((event) => {
    switch (event.type) {
      case "job-started":
        jobs[event.jobId] = "in_progress";
        break;
      case "job-finished":
        jobs[event.jobId] = mapJobResult(event.result);
        break;
      case "step-started": {
        const step = findOrCreateStep(event.jobId, event.index, event.label);
        step.status = "in_progress";
        step.startedAt = new Date().toISOString();
        break;
      }
      case "step-finished": {
        const step = findOrCreateStep(event.jobId, event.index, event.label);
        step.status = mapStepResult(event.result);
        step.finishedAt = new Date().toISOString();
        if (event.log.truncated) step.logTruncated = true;
        void putStepLog(runId, event.jobId, event.index, event.log);
        break;
      }
    }
    void putRun({
      runId,
      workflowName,
      status: "in_progress",
      startedAt,
      jobs: { ...jobs },
      steps: [...steps],
      trigger,
    });
  });

  await putRun({
    runId,
    workflowName,
    status: "in_progress",
    startedAt,
    jobs: {},
    steps: [],
    trigger,
  });

  try {
    const { success } = await run(events);
    await putRun({
      runId,
      workflowName,
      status: success ? "succeeded" : "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      jobs,
      steps,
      trigger,
    });
    return success;
  } catch (error) {
    await putRun({
      runId,
      workflowName,
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      jobs,
      steps,
      trigger,
    });
    throw error;
  }
}
