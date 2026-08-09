import type { Job } from "./schema.ts";
import type { JobContext, JobOutcome, JobResult, RootContext, StepResult } from "./context.ts";
import { evaluateJobIf, interpolateStep, toJobContext } from "./context.ts";
import { resolveStepCwd, runStep, StepRunError, type StepLogCapture } from "./run-step.ts";
import type { JobLogger } from "./logging.ts";
import { WorkflowExpressionError } from "./expressions.ts";

const EMPTY_LOG: StepLogCapture = { stdout: "", stderr: "", truncated: false };

/** Fired as a job's steps start/finish, so a caller can track step-level progress and capture logs. */
export type StepEvent =
  | { type: "step-started"; index: number; label: string }
  | {
    type: "step-finished";
    index: number;
    label: string;
    result: StepResult;
    durationMs: number;
    continuedOnError: boolean;
    log: StepLogCapture;
  };

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
  onStep?: (event: StepEvent) => void,
): Promise<JobOutcome> {
  if (job.if !== undefined && !evaluateJobIf(job.if, root)) {
    logger.info(`skipped (if: ${job.if})`);
    return { result: "skipped", outputs: {} };
  }

  const ctx: JobContext = toJobContext(root);
  const outputs: Record<string, string> = {};
  let result: JobResult = "success";

  for (const [index, step] of job.steps.entries()) {
    const effectiveCwd = resolveStepCwd(step, job.in, cwd, ctx);
    const label = interpolateStep(step.name ?? (step.run !== undefined ? "shell" : "script"), ctx, effectiveCwd);

    if (signal.aborted) {
      result = "cancelled";
      logger.stepEnd(label, "skipped", 0);
      onStep?.({ type: "step-started", index, label });
      onStep?.({ type: "step-finished", index, label, result: "skipped", durationMs: 0, continuedOnError: false, log: EMPTY_LOG });
      continue;
    }

    if (result !== "success") {
      logger.stepEnd(label, "skipped", 0);
      onStep?.({ type: "step-started", index, label });
      onStep?.({ type: "step-finished", index, label, result: "skipped", durationMs: 0, continuedOnError: false, log: EMPTY_LOG });
      continue;
    }

    logger.stepStart(label);
    onStep?.({ type: "step-started", index, label });
    const startedAt = performance.now();
    let outcome;
    try {
      outcome = await runStep(step, workflowDir, cwd, ctx, signal, job.in);
    } catch (error) {
      if (error instanceof WorkflowExpressionError) throw error;
      result = signal.aborted ? "cancelled" : "failure";
      const durationMs = performance.now() - startedAt;
      const stepResult: StepResult = result === "cancelled" ? "skipped" : "failure";
      logger.stepEnd(label, stepResult, durationMs);
      logger.info(`error: ${error instanceof Error ? error.message : error}`);
      const log = error instanceof StepRunError ? error.log : EMPTY_LOG;
      onStep?.({ type: "step-finished", index, label, result: stepResult, durationMs, continuedOnError: false, log });
      continue;
    }
    const durationMs = performance.now() - startedAt;
    logger.stepEnd(label, outcome.result, durationMs, outcome.continuedOnError);
    onStep?.({
      type: "step-finished",
      index,
      label,
      result: outcome.result,
      durationMs,
      continuedOnError: outcome.continuedOnError,
      log: outcome.log,
    });

    if (step.id !== undefined) {
      ctx.steps[step.id] = { outputs: outcome.outputs };
    }
    Object.assign(outputs, outcome.outputs);
  }

  return { result, outputs };
}
