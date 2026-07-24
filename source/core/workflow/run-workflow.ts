import { pooledMap } from "@std/async";
import type { Job, Workflow } from "./schema.ts";
import { buildBatches, transitiveDeps } from "./graph.ts";
import {
  buildRootContext,
  type JobOutcome,
  type MatrixNeedsResult,
  type NeedsResult,
  type RootContext,
} from "./context.ts";
import { runJob } from "./run-job.ts";
import { expandMatrix } from "./matrix.ts";
import { JobLogger, printSummary, type SummaryRow } from "./logging.ts";

export interface RunWorkflowOptions {
  workflowDir: string;
  variables?: Record<string, string>;
  /** Run only this job and its transitive dependencies. */
  job?: string;
  /** Max number of jobs to run concurrently within a batch. */
  concurrency?: number;
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
      const outcome = await runJob(job, instanceRoot, workflowDir, logger, controller.signal);
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
  const variables = options.variables ?? Object.fromEntries(Object.entries(Deno.env.toObject()));
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

  for (const batch of batches) {
    const results = pooledMap(
      Math.min(concurrency, batch.length) || 1,
      batch,
      async (jobId) => {
        const job = workflow.jobs[jobId];
        const deps = job.needs ?? [];
        const depsOk = deps.every((dep) => outcomes[dep]?.result !== "failure");

        const logger = new JobLogger(jobId);
        let needsResult: NeedsResult;
        let durationMs: number;
        if (!depsOk) {
          logger.info(`skipped (dependency failed)`);
          needsResult = { result: "skipped", outputs: {} };
          durationMs = logger.flush("skipped");
        } else if (job.matrix !== undefined) {
          const root = buildRootContext(variables, outcomes);
          const matrixRun = await runMatrixJob(jobId, job, root, options.workflowDir, concurrency);
          needsResult = matrixRun.needsResult;
          durationMs = matrixRun.durationMs;
        } else {
          const root = buildRootContext(variables, outcomes);
          const outcome = await runJob(job, root, options.workflowDir, logger);
          needsResult = { result: outcome.result, outputs: outcome.outputs };
          durationMs = logger.flush(outcome.result);
        }
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

  printSummary(summary);

  const success = Object.values(outcomes).every((o) => o.result !== "failure");
  return { outcomes, success };
}
