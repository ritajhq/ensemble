import type { JsonValue } from "./expressions.ts";
import { evaluateCondition, interpolate } from "./expressions.ts";
import type { ResolvedVariable } from "./context-loaders/resolve.ts";

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

/** Where a resources.repositories entry was checked out. */
export interface RepositoryContext {
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
  /** Where each resources.repositories entry was checked out. Absent when the workflow declares none. */
  repositories?: Record<string, RepositoryContext>;
  /**
   * `context.variables` (not secrets), addressable as
   * `context.variables.<key>.{name,value,path}` — an alternative to their
   * `NAME`/`NAME_FILE` env vars. `files`/`secretFiles` back the
   * `contextFile("<filename>")`/`contextSecretFile("<filename>")` expression
   * functions (see expressions.ts) — every filename statically referenced
   * anywhere in the workflow, pre-resolved to a real path before any job
   * runs (see context-loaders/resolve.ts). Absent entirely when the
   * workflow declares no `context.variables` and references no
   * `contextFile`/`contextSecretFile` calls.
   */
  context?: {
    variables: Record<string, ResolvedVariable>;
    files: Record<string, string>;
    secretFiles: Record<string, string>;
  };
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
  repositories?: Record<string, RepositoryContext>;
  context?: { variables: Record<string, ResolvedVariable>; files: Record<string, string>; secretFiles: Record<string, string> };
}

export interface BuildRootContextOptions {
  matrix?: Record<string, unknown>;
  trigger?: Record<string, unknown>;
  repositories?: Record<string, RepositoryContext>;
  contextVariables?: Record<string, ResolvedVariable>;
  contextFiles?: Record<string, string>;
  contextSecretFiles?: Record<string, string>;
}

export function buildRootContext(
  variables: Record<string, string>,
  completedJobs: Record<string, NeedsResult>,
  options: BuildRootContextOptions = {},
): RootContext {
  const root: RootContext = { variables, needs: { ...completedJobs } };
  if (options.matrix !== undefined) root.matrix = options.matrix;
  if (options.trigger !== undefined) root.trigger = options.trigger;
  if (options.repositories !== undefined) root.repositories = options.repositories;
  if (options.contextVariables !== undefined || options.contextFiles !== undefined || options.contextSecretFiles !== undefined) {
    root.context = {
      variables: options.contextVariables ?? {},
      files: options.contextFiles ?? {},
      secretFiles: options.contextSecretFiles ?? {},
    };
  }
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
  if (ctx.repositories !== undefined) stepContext.repositories = ctx.repositories;
  if (ctx.context !== undefined) stepContext.context = ctx.context;
  return stepContext;
}
