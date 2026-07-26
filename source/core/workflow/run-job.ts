import type { Job } from "./schema.ts";
import type { JobContext, JobOutcome, JobResult, RootContext } from "./context.ts";
import { evaluateJobIf, toJobContext } from "./context.ts";
import { runStep } from "./run-step.ts";
import type { JobLogger } from "./logging.ts";
import { WorkflowExpressionError } from "./expressions.ts";

/**
 * Runs a job's steps sequentially, accumulating steps.<id>.outputs into the
 * job context as each completes. Stops early on a non-continue-on-error
 * failure and marks remaining steps skipped. Job outputs are the union of
 * all its steps' outputs.
 *
 * `signal` is checked before starting each step and passed into `runStep`.
 * If it's already aborted (fail-fast triggered by a sibling matrix instance)
 * before this job starts any step, or fires mid-flight and kills an
 * in-flight subprocess step, the job's result is "cancelled" — distinct
 * from "failure", since the instance didn't fail on its own merits.
 */
export async function runJob(
  job: Job,
  root: RootContext,
  workflowDir: string,
  cwd: string,
  logger: JobLogger,
  signal: AbortSignal = new AbortController().signal,
): Promise<JobOutcome> {
  if (job.if !== undefined && !evaluateJobIf(job.if, root)) {
    logger.info(`skipped (if: ${job.if})`);
    return { result: "skipped", outputs: {} };
  }

  const ctx: JobContext = toJobContext(root);
  const outputs: Record<string, string> = {};
  let result: JobResult = "success";

  for (const step of job.steps) {
    const label = step.name ?? (step.run !== undefined ? "shell" : "script");

    if (signal.aborted) {
      result = "cancelled";
      logger.stepEnd(label, "skipped", 0);
      continue;
    }

    if (result !== "success") {
      logger.stepEnd(label, "skipped", 0);
      continue;
    }

    logger.stepStart(label);
    const startedAt = performance.now();
    let outcome;
    try {
      outcome = await runStep(step, workflowDir, cwd, ctx, signal);
    } catch (error) {
      if (error instanceof WorkflowExpressionError) throw error;
      result = signal.aborted ? "cancelled" : "failure";
      logger.stepEnd(label, result === "cancelled" ? "skipped" : "failure", performance.now() - startedAt);
      logger.info(`error: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    logger.stepEnd(
      label,
      outcome.result,
      performance.now() - startedAt,
      outcome.continuedOnError,
    );

    if (step.id !== undefined) {
      ctx.steps[step.id] = { outputs: outcome.outputs };
    }
    Object.assign(outputs, outcome.outputs);
  }

  return { result, outputs };
}
