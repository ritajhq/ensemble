import type { JsonValue } from "./expressions.ts";
import { evaluateCondition, interpolate } from "./expressions.ts";

/**
 * "cancelled" applies only at job-instance granularity — a not-yet-started
 * matrix instance skipped by fail-fast, or one whose in-flight subprocess
 * step got signal-killed mid-run. There's no step-level "cancelled": a step
 * that was running when the signal fired either already finished, or its
 * subprocess was killed and its containing job is reported "cancelled".
 */
export type JobResult = "success" | "failure" | "skipped" | "cancelled";
export type StepResult = "success" | "failure" | "skipped";

export interface StepOutcome {
  result: StepResult;
  outputs: Record<string, string>;
}

/** The result of running a single job instance (one matrix combination, or the whole job if unmatrixed). */
export interface JobOutcome {
  result: JobResult;
  outputs: Record<string, string>;
}

/** How a non-matrixed job's completion is exposed to downstream jobs via `needs.<job>`. */
export interface SimpleNeedsResult {
  result: JobResult;
  outputs: Record<string, string>;
}

/**
 * How a matrixed job's completion is exposed to downstream jobs via
 * `needs.<job>`. `matrix[i]`, `results[i]`, and `outputs.<name>[i]` are all
 * indexed by the same deterministic order — the job's Cartesian-product
 * expansion order (see matrix.ts), fixed by the workflow definition, not by
 * which instance happens to finish first. `result` is "success" only if
 * every instance succeeded.
 */
export interface MatrixNeedsResult {
  result: JobResult;
  matrix: Record<string, unknown>[];
  results: JobResult[];
  outputs: Record<string, (string | undefined)[]>;
}

export type NeedsResult = SimpleNeedsResult | MatrixNeedsResult;

/** The deploy context this run was invoked with (e.g. `--context production`). Absent when no context was given. */
export interface RunContext {
  name: string;
  /** Absolute path to this context's own folder (e.g. "<repoRoot>/contexts/production"), so steps can read files from it regardless of their own cwd. */
  path: string;
}

/** Root context shared across all jobs: variables and already-completed jobs' results/outputs. */
export interface RootContext {
  variables: Record<string, string>;
  needs: Record<string, NeedsResult>;
  /** This instance's own matrix combination. Absent entirely for non-matrixed jobs. */
  matrix?: Record<string, unknown>;
  /** Data from whatever triggered this run (see schema.ts's Trigger). Absent for a direct/untriggered invocation. */
  trigger?: Record<string, unknown>;
  /** The deploy context this run was invoked with. Absent when no --context was given. */
  context?: RunContext;
}

/** Per-job context, accumulating `steps.*` as each step in that job completes. */
export interface JobContext extends RootContext {
  steps: Record<string, { outputs: Record<string, string> }>;
}

/**
 * Plain-data context passed into a `script:` module's exported `run()`
 * function. `script:` steps run as subprocesses (so fail-fast can actually
 * kill them), so this crosses a JSON serialization boundary — no functions,
 * hence no `evaluate()`. Read `matrix`/`needs` values via ordinary
 * property/array access instead.
 */
export interface StepContext {
  variables: Record<string, string>;
  needs: Record<string, NeedsResult>;
  matrix?: Record<string, unknown>;
  trigger?: Record<string, unknown>;
  context?: RunContext;
}

export function buildRootContext(
  variables: Record<string, string>,
  completedJobs: Record<string, NeedsResult>,
  matrix?: Record<string, unknown>,
  trigger?: Record<string, unknown>,
  context?: RunContext,
): RootContext {
  const root: RootContext = { variables, needs: { ...completedJobs } };
  if (matrix !== undefined) root.matrix = matrix;
  if (trigger !== undefined) root.trigger = trigger;
  if (context !== undefined) root.context = context;
  return root;
}

export function toJobContext(root: RootContext): JobContext {
  return { ...root, steps: {} };
}

function toRecord(ctx: JobContext): Record<string, JsonValue> {
  return ctx as unknown as Record<string, JsonValue>;
}

export function evaluateJobIf(expr: string, ctx: RootContext): boolean {
  return evaluateCondition(expr, ctx as unknown as Record<string, JsonValue>);
}

export function evaluateStepIf(expr: string, ctx: JobContext): boolean {
  return evaluateCondition(expr, toRecord(ctx));
}

/** Replaces `${{ ... }}` occurrences in `text` (e.g. a step's `run:` or `name:`) using this job's context. */
export function interpolateStep(text: string, ctx: JobContext): string {
  return interpolate(text, toRecord(ctx));
}

export function toStepContext(ctx: JobContext): StepContext {
  const stepContext: StepContext = { variables: ctx.variables, needs: ctx.needs };
  if (ctx.matrix !== undefined) stepContext.matrix = ctx.matrix;
  if (ctx.trigger !== undefined) stepContext.trigger = ctx.trigger;
  if (ctx.context !== undefined) stepContext.context = ctx.context;
  return stepContext;
}
