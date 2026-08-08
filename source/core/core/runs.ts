import { Delegate } from "@ritaj/event";
import type {
  JobResult,
  RunWorkflowResult,
  StepResult,
  WorkflowEvent,
} from "@ensemble/workflow";
import { publishRunUpdate } from "./runs-broadcast.ts";

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

/**
 * Newest-first ordering falls out of a plain prefix scan by inverting the
 * timestamp in the key, rather than relying on `list()`'s `reverse` option.
 */
function invertedTimestamp(ms: number): string {
  return (Number.MAX_SAFE_INTEGER - ms).toString().padStart(16, "0");
}

// Deno KV caps a value at 64KiB; stay well under that so a chunk plus its
// key/entry overhead never risks tripping the limit.
const LOG_CHUNK_BYTES = 56 * 1024;

interface StepLogMeta {
  stdoutChunks: number;
  stderrChunks: number;
  truncated: boolean;
}

function chunkBytes(bytes: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += LOG_CHUNK_BYTES) {
    chunks.push(bytes.subarray(offset, offset + LOG_CHUNK_BYTES));
  }
  return chunks;
}

/**
 * Persists run tracking data (status, jobs, steps, logs) for the dashboard/SSE
 * to read. Takes its `Deno.Kv` connection via constructor injection — opened
 * once by the caller (an entrypoint) rather than lazily inside this module,
 * so tests can construct a store against an isolated instance instead of
 * sharing one process-wide connection.
 */
export class RunStore {
  /**
   * Marks a runId as deleted-while-in-progress: `putRun` checks this and
   * refuses every subsequent write for that runId, so the still-running
   * process that owns it can't resurrect the record via any of its remaining
   * mid-run or completion writes. Cleared once `trackedRunWorkflow` itself
   * observes the run has finished (see its `finally`) — a finished run's
   * delete never needs a tombstone in the first place, since nothing writes
   * to a finished run's record again.
   */
  private readonly deletedWhileInProgress = new Set<string>();

  constructor(private readonly kv: Deno.Kv) {}

  /** Writes `record`, unless its runId was deleted while still in_progress — in that case the write is silently dropped. */
  private async putRun(record: RunRecord): Promise<void> {
    if (this.deletedWhileInProgress.has(record.runId)) return;

    const key = [
      "runs",
      record.workflowName,
      invertedTimestamp(new Date(record.startedAt).getTime()),
      record.runId,
    ];
    await this.kv.atomic()
      .set(key, record)
      .set(["runs-latest", record.workflowName], record)
      .set(["runs-by-id", record.runId], record)
      .commit();
  }

  /**
   * Persists an in-progress snapshot and publishes it to any live SSE
   * subscribers, without letting either failure take the process down —
   * called on every event during a run, so it must never throw.
   */
  private persistAndPublish(record: RunRecord): void {
    publishRunUpdate(record.runId, record);
    this.putRun(record).catch((error) => {
      console.error(`Failed to persist run ${record.runId}:`, error);
    });
  }

  /** All runs for a workflow, newest first. */
  async listRunsForWorkflow(workflowName: string): Promise<RunRecord[]> {
    const out: RunRecord[] = [];
    for await (const entry of this.kv.list<RunRecord>({ prefix: ["runs", workflowName] })) {
      out.push(entry.value);
    }
    return out;
  }

  /** The most recent run for a workflow, including one still in progress. */
  async getLatestRun(workflowName: string): Promise<RunRecord | undefined> {
    const entry = await this.kv.get<RunRecord>(["runs-latest", workflowName]);
    return entry.value ?? undefined;
  }

  /**
   * A specific run, or undefined if the run id is unknown or doesn't belong to
   * `workflowName` — scoping by workflow name (not just runId) keeps this
   * consistent with `listRunsForWorkflow`'s scoping and stops a caller from
   * fetching another workflow's run just by guessing/reusing a runId.
   */
  async getRun(runId: string, workflowName: string): Promise<RunRecord | undefined> {
    const entry = await this.kv.get<RunRecord>(["runs-by-id", runId]);
    if (!entry.value || entry.value.workflowName !== workflowName) {
      return undefined;
    }
    return entry.value;
  }

  /** A specific run's step records (across all its jobs), or undefined if the run id is unknown or doesn't belong to `workflowName`. */
  async getRunSteps(runId: string, workflowName: string): Promise<StepRecord[] | undefined> {
    const run = await this.getRun(runId, workflowName);
    return run?.steps ?? (run ? [] : undefined);
  }

  /**
   * Deletes keys in fixed-size atomic batches, mirroring `putChunks`'s
   * batching for the same reason — an atomic transaction caps both its
   * mutation count and total payload size.
   */
  private async deleteKeys(keys: Deno.KvKey[]): Promise<void> {
    const BATCH_SIZE = 10;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      let op = this.kv.atomic();
      for (let j = i; j < Math.min(i + BATCH_SIZE, keys.length); j++) {
        op = op.delete(keys[j]);
      }
      await op.commit();
    }
  }

  /**
   * Deletes a run and everything it owns — its record, index entries, and
   * every step log chunk — or returns false without changing anything if the
   * run id is unknown or doesn't belong to `workflowName`.
   *
   * Deleting doesn't stop an in_progress run's underlying workflow process
   * (there's no cancel mechanism) — that process is still going to call
   * `putRun` again as it progresses and eventually finishes, which would
   * otherwise silently recreate the record this call just removed. Tombstone
   * the runId first so every one of those remaining writes is dropped
   * instead; `trackedRunWorkflow` clears the tombstone once it itself
   * observes the run has finished. A run that's already finished needs none
   * of this — nothing will ever write to its record again.
   */
  async deleteRun(runId: string, workflowName: string): Promise<boolean> {
    const run = await this.getRun(runId, workflowName);
    if (!run) return false;

    if (run.status === "in_progress") {
      this.deletedWhileInProgress.add(runId);
    }

    const keys: Deno.KvKey[] = [
      ["runs", run.workflowName, invertedTimestamp(new Date(run.startedAt).getTime()), run.runId],
      ["runs-by-id", run.runId],
    ];

    const latest = await this.kv.get<RunRecord>(["runs-latest", workflowName]);
    if (latest.value?.runId === runId) {
      keys.push(["runs-latest", workflowName]);
    }

    for await (const entry of this.kv.list<StepLogMeta>({ prefix: ["run-logs-meta", runId] })) {
      const [, , jobId, index] = entry.key;
      keys.push(entry.key);
      for (let i = 0; i < entry.value.stdoutChunks; i++) {
        keys.push(["run-logs", runId, jobId, index, "stdout", i]);
      }
      for (let i = 0; i < entry.value.stderrChunks; i++) {
        keys.push(["run-logs", runId, jobId, index, "stderr", i]);
      }
    }

    await this.deleteKeys(keys);
    return true;
  }

  /**
   * Writes chunks in fixed-size batches rather than one big atomic transaction
   * — Deno KV caps both the mutation count and total payload size of a single
   * atomic commit, and a large step's log can exceed either well before it
   * exceeds this function's own per-chunk KV value limit.
   */
  private async putChunks(keyPrefix: Deno.KvKeyPart[], chunks: Uint8Array[]): Promise<void> {
    const BATCH_SIZE = 10;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      let op = this.kv.atomic();
      for (let j = i; j < Math.min(i + BATCH_SIZE, chunks.length); j++) {
        op = op.set([...keyPrefix, j], chunks[j]);
      }
      await op.commit();
    }
  }

  private async putStepLog(runId: string, jobId: string, index: number, log: StepLog): Promise<void> {
    const encoder = new TextEncoder();
    const stdoutChunks = chunkBytes(encoder.encode(log.stdout));
    const stderrChunks = chunkBytes(encoder.encode(log.stderr));

    await this.putChunks(["run-logs", runId, jobId, index, "stdout"], stdoutChunks);
    await this.putChunks(["run-logs", runId, jobId, index, "stderr"], stderrChunks);

    const meta: StepLogMeta = {
      stdoutChunks: stdoutChunks.length,
      stderrChunks: stderrChunks.length,
      truncated: log.truncated,
    };
    await this.kv.set(["run-logs-meta", runId, jobId, index], meta);
  }

  private async readLogStream(
    runId: string,
    jobId: string,
    index: number,
    stream: "stdout" | "stderr",
    chunkCount: number,
  ): Promise<string> {
    const chunks = await Promise.all(
      Array.from(
        { length: chunkCount },
        (_, i) => this.kv.get<Uint8Array>(["run-logs", runId, jobId, index, stream, i]),
      ),
    );
    const bytes = chunks.reduce((total, entry) => total + (entry.value?.length ?? 0), 0);
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const entry of chunks) {
      if (!entry.value) continue;
      combined.set(entry.value, offset);
      offset += entry.value.length;
    }
    return new TextDecoder().decode(combined);
  }

  /** A specific step's captured stdout/stderr, or undefined if no log was recorded for it or the run doesn't belong to `workflowName`. */
  async getStepLog(runId: string, jobId: string, index: number, workflowName: string): Promise<StepLog | undefined> {
    const runEntry = await this.kv.get<RunRecord>(["runs-by-id", runId]);
    if (!runEntry.value || runEntry.value.workflowName !== workflowName) {
      return undefined;
    }
    const metaEntry = await this.kv.get<StepLogMeta>(["run-logs-meta", runId, jobId, index]);
    if (!metaEntry.value) return undefined;
    const { stdoutChunks, stderrChunks, truncated } = metaEntry.value;
    const [stdout, stderr] = await Promise.all([
      this.readLogStream(runId, jobId, index, "stdout", stdoutChunks),
      this.readLogStream(runId, jobId, index, "stderr", stderrChunks),
    ]);
    return { stdout, stderr, truncated };
  }

  /**
   * Runs `run` while tracking its progress in Deno KV, keyed by a fresh run id.
   * `run` is handed a `Delegate` to pass through as `RunWorkflowOptions.events`
   * — job-started/job-finished notifications update the run's job-status map
   * and persist on every change, so "in_progress" is visible to readers for
   * the whole run duration, not just at the end.
   */
  async trackedRunWorkflow(
    workflowName: string,
    trigger: Record<string, unknown> | undefined,
    run: (events: Delegate<[WorkflowEvent]>) => Promise<RunWorkflowResult>,
  ): Promise<boolean> {
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const jobs: Record<string, JobStatus> = {};
    const steps: StepRecord[] = [];
    const events = new Delegate<[WorkflowEvent]>();

    function findOrCreateStep(jobId: string, index: number, label: string): StepRecord {
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
          // Persisting a step's log must never take the process down with it —
          // an unawaited rejection here would otherwise surface as an unhandled
          // rejection and crash the server, dropping this run's progress along
          // with it. A step's own success/failure never depends on whether its
          // log made it into KV.
          this.putStepLog(runId, event.jobId, event.index, event.log).catch((error) => {
            console.error(`Failed to persist log for step ${event.jobId}/${event.index}:`, error);
          });
          break;
        }
      }
      this.persistAndPublish({
        runId,
        workflowName,
        status: "in_progress",
        startedAt,
        jobs: { ...jobs },
        steps: [...steps],
        trigger,
      });
    });

    await this.putRun({
      runId,
      workflowName,
      status: "in_progress",
      startedAt,
      jobs: {},
      steps: [],
      trigger,
    });
    publishRunUpdate(runId, { runId, workflowName, status: "in_progress", startedAt, jobs: {}, steps: [], trigger });

    try {
      const { success } = await run(events);
      const record: RunRecord = {
        runId,
        workflowName,
        status: success ? "succeeded" : "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        jobs,
        steps,
        trigger,
      };
      await this.putRun(record);
      publishRunUpdate(runId, record);
      return success;
    } catch (error) {
      const record: RunRecord = {
        runId,
        workflowName,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        jobs,
        steps,
        trigger,
      };
      await this.putRun(record);
      publishRunUpdate(runId, record);
      throw error;
    } finally {
      // No more writes for this runId will happen after this point, so the
      // tombstone (if any) has served its purpose — dropping it here rather
      // than leaving it set forever.
      this.deletedWhileInProgress.delete(runId);
    }
  }
}

/** Where this store's `Deno.Kv` file lives, relative to the repo root — for entrypoints to open. */
export const RUN_STORE_KV_PATH = ".ensemble/platform/runs.kv";
