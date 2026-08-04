import { pooledMap } from "@std/async";
import type { Delegate } from "@ritaj/event";
import type { Job, Workflow } from "./schema.ts";
import { buildBatches, transitiveDeps } from "./graph.ts";
import {
  buildRootContext,
  type JobOutcome,
  type JobResult,
  type MatrixNeedsResult,
  type NeedsResult,
  type RootContext,
  type RunContext,
} from "./context.ts";
import { runJob, type StepEvent } from "./run-job.ts";
import { expandMatrix } from "./matrix.ts";
import { JobLogger, printSummary, type SummaryRow } from "./logging.ts";

/**
 * Fired as jobs (and, for non-matrixed jobs, their steps) start/finish, so a
 * caller can track a run's progress without parsing log output. Matrixed
 * jobs' step-level detail isn't surfaced here for now — each matrix instance
 * runs under the same shared `jobId`, so per-instance step identity has no
 * unambiguous representation yet; only their job-started/job-finished events
 * fire, same as before this event type grew step variants.
 */
export type WorkflowEvent =
  | { type: "job-started"; jobId: string }
  | { type: "job-finished"; jobId: string; result: JobResult; durationMs: number }
  | ({ jobId: string } & Extract<StepEvent, { type: "step-started" }>)
  | ({ jobId: string } & Extract<StepEvent, { type: "step-finished" }>);

export interface RunWorkflowOptions {
  workflowDir: string;
  variables?: Record<string, string>;
  /** Run only this job and its transitive dependencies. */
  job?: string;
  /** Max number of jobs to run concurrently within a batch. */
  concurrency?: number;
  /** Data from whatever triggered this run, made available as `trigger.*` in every job/step. */
  trigger?: Record<string, unknown>;
  /** The deploy context this run was invoked with, made available as `context.*` in every job/step. Already resolved (name + absolute path) by the caller. */
  context?: RunContext;
  /**
   * Repo root to expose to steps as `ENSEMBLE_WORKSPACE`, so an `ens` subcommand
   * invoked from a `run:` step can find it even though steps' `cwd` is a scratch
   * temp dir unrelated to the repo (see findRepoRoot in @ensemble/core).
   */
  repoRoot?: string;
  /** Notified as jobs start/finish, for callers that want to track run progress. */
  events?: Delegate<[WorkflowEvent]>;
}

export interface RunWorkflowResult {
  outcomes: Record<string, NeedsResult>;
  success: boolean;
}

function matrixInstanceLabel(jobId: string, combo: Record<string, unknown>): string {
  const parts = Object.entries(combo).map(([k, v]) => `${k}=${v}`);
  return `${jobId}[${parts.join(", ")}]`;
}

/**
 * Runs one matrixed job: every combination concurrently (capped by both the
 * job's own `max-parallel`, if set, and the global batch `concurrency`),
 * folded into an index-safe MatrixNeedsResult. Fail-fast (default true)
 * aborts a shared AbortSignal on the first hard failure: in-flight instances'
 * subprocess steps get genuinely killed, and instances that haven't started
 * yet are skipped — both report as "cancelled", not "failure".
 */
async function runMatrixJob(
  jobId: string,
  job: Job,
  root: RootContext,
  workflowDir: string,
  cwd: string,
  concurrency: number,
): Promise<{ needsResult: MatrixNeedsResult; durationMs: number }> {
  const matrix = job.matrix!;
  const combos = expandMatrix(matrix.axes);
  const failFast = matrix["fail-fast"] ?? true;
  const instanceConcurrency = Math.min(concurrency, matrix["max-parallel"] ?? Infinity, combos.length) || 1;
  const startedAt = performance.now();

  const controller = new AbortController();

  const instanceOutcomes: JobOutcome[] = new Array(combos.length);
  const results = pooledMap(
    instanceConcurrency,
    combos.map((combo, index) => ({ combo, index })),
    async ({ combo, index }) => {
      const logger = new JobLogger(matrixInstanceLabel(jobId, combo));
      const instanceRoot = { ...root, matrix: combo };
      const outcome = await runJob(job, instanceRoot, workflowDir, cwd, logger, controller.signal);
      logger.flush(outcome.result);
      if (outcome.result === "failure" && failFast) {
        controller.abort();
      }
      return { index, outcome };
    },
  );

  for await (const { index, outcome } of results) {
    instanceOutcomes[index] = outcome;
  }

  const outputKeys = new Set<string>();
  for (const outcome of instanceOutcomes) {
    for (const key of Object.keys(outcome.outputs)) outputKeys.add(key);
  }
  const outputs: Record<string, (string | undefined)[]> = {};
  for (const key of outputKeys) {
    outputs[key] = instanceOutcomes.map((o) => o.outputs[key]);
  }

  const needsResult: MatrixNeedsResult = {
    result: instanceOutcomes.every((o) => o.result === "success") ? "success" : "failure",
    matrix: combos,
    results: instanceOutcomes.map((o) => o.result),
    outputs,
  };

  return { needsResult, durationMs: performance.now() - startedAt };
}

/**
 * Drives a workflow's jobs to completion in topological batches, running
 * independent jobs within a batch concurrently (up to `concurrency`).
 * A job whose dependencies didn't all succeed is skipped rather than run.
 * A matrixed job runs every combination concurrently and folds them into
 * one index-safe MatrixNeedsResult (see context.ts) for its dependents.
 */
export async function runWorkflow(
  workflow: Workflow,
  options: RunWorkflowOptions,
): Promise<RunWorkflowResult> {
  const variables = {
    ...Deno.env.toObject(),
    ...workflow.variables,
    ...options.variables,
  };
  if (options.repoRoot !== undefined) {
    variables.ENSEMBLE_WORKSPACE = options.repoRoot;
  }
  const concurrency = options.concurrency ?? Infinity;

  let batches = buildBatches(workflow);
  if (options.job !== undefined) {
    const allowed = new Set([options.job, ...transitiveDeps(workflow, options.job)]);
    batches = batches
      .map((batch) => batch.filter((id) => allowed.has(id)))
      .filter((batch) => batch.length > 0);
  }

  const outcomes: Record<string, NeedsResult> = {};
  const summary: SummaryRow[] = [];

  // Every run gets its own fresh scratch directory as steps' cwd, so a job's
  // shell commands (e.g. `git clone`) never see leftovers from a prior run —
  // workflowDir itself stays reserved for resolving `script:` paths.
  const runDir = await Deno.makeTempDir({ prefix: "ensemble-run-" });
  try {
    for (const batch of batches) {
      const results = pooledMap(
        Math.min(concurrency, batch.length) || 1,
        batch,
        async (jobId) => {
          const job = workflow.jobs[jobId];
          const deps = job.needs ?? [];
          const depsOk = deps.every((dep) => outcomes[dep]?.result !== "failure");

          const logger = new JobLogger(jobId);
          options.events?.Invoke({ type: "job-started", jobId });
          let needsResult: NeedsResult;
          let durationMs: number;
          if (!depsOk) {
            logger.info(`skipped (dependency failed)`);
            needsResult = { result: "skipped", outputs: {} };
            durationMs = logger.flush("skipped");
          } else if (job.matrix !== undefined) {
            const root = buildRootContext(variables, outcomes, undefined, options.trigger, options.context);
            const matrixRun = await runMatrixJob(jobId, job, root, options.workflowDir, runDir, concurrency);
            needsResult = matrixRun.needsResult;
            durationMs = matrixRun.durationMs;
          } else {
            const root = buildRootContext(variables, outcomes, undefined, options.trigger, options.context);
            const outcome = await runJob(
              job,
              root,
              options.workflowDir,
              runDir,
              logger,
              undefined,
              (event) => options.events?.Invoke({ ...event, jobId }),
            );
            needsResult = { result: outcome.result, outputs: outcome.outputs };
            durationMs = logger.flush(outcome.result);
          }
          options.events?.Invoke({ type: "job-finished", jobId, result: needsResult.result, durationMs });
          return { jobId, needsResult, durationMs };
        },
      );

      try {
        for await (const { jobId, needsResult, durationMs } of results) {
          outcomes[jobId] = needsResult;
          summary.push({ jobId, result: needsResult.result, durationMs });
        }
      } catch (error) {
        if (error instanceof AggregateError && error.errors.length === 1) {
          throw error.errors[0];
        }
        throw error;
      }
    }
  } finally {
    await Deno.remove(runDir, { recursive: true }).catch(() => {});
  }

  printSummary(summary);

  const success = Object.values(outcomes).every((o) => o.result !== "failure");
  return { outcomes, success };
}
