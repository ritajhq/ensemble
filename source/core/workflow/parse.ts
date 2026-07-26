import { parse as parseYaml } from "@std/yaml";
import type { GithubTrigger, HttpTrigger, Job, Matrix, Step, Trigger, Workflow } from "./schema.ts";

export class WorkflowParseError extends Error {}

function fail(file: string, message: string): never {
  throw new WorkflowParseError(`${file}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStep(file: string, jobId: string, index: number, raw: unknown): Step {
  if (!isRecord(raw)) {
    fail(file, `job "${jobId}" step #${index + 1} must be a mapping.`);
  }
  const hasRun = typeof raw.run === "string";
  const hasScript = typeof raw.script === "string";
  if (hasRun === hasScript) {
    fail(
      file,
      `job "${jobId}" step #${index + 1} must have exactly one of "run" or "script".`,
    );
  }
  if (raw.id !== undefined && typeof raw.id !== "string") {
    fail(file, `job "${jobId}" step #${index + 1} has a non-string "id".`);
  }
  if (raw.name !== undefined && typeof raw.name !== "string") {
    fail(file, `job "${jobId}" step #${index + 1} has a non-string "name".`);
  }
  if (raw.if !== undefined && typeof raw.if !== "string") {
    fail(file, `job "${jobId}" step #${index + 1} has a non-string "if".`);
  }
  const continueOnError = raw["continue-on-error"];
  if (continueOnError !== undefined && typeof continueOnError !== "boolean") {
    fail(file, `job "${jobId}" step #${index + 1} has a non-boolean "continue-on-error".`);
  }
  return {
    id: raw.id as string | undefined,
    name: raw.name as string | undefined,
    run: raw.run as string | undefined,
    script: raw.script as string | undefined,
    if: raw.if as string | undefined,
    "continue-on-error": continueOnError as boolean | undefined,
  };
}

function validateMatrix(file: string, jobId: string, raw: unknown): Matrix {
  if (!isRecord(raw)) {
    fail(file, `job "${jobId}" has a "matrix" that isn't a mapping.`);
  }
  if (!isRecord(raw.axes) || Object.keys(raw.axes).length === 0) {
    fail(file, `job "${jobId}" matrix must declare a non-empty "axes" mapping.`);
  }
  for (const [key, value] of Object.entries(raw.axes)) {
    if (!Array.isArray(value) || value.length === 0) {
      fail(file, `job "${jobId}" matrix axis "${key}" must be a non-empty list.`);
    }
  }
  const failFast = raw["fail-fast"];
  if (failFast !== undefined && typeof failFast !== "boolean") {
    fail(file, `job "${jobId}" matrix has a non-boolean "fail-fast".`);
  }
  const maxParallel = raw["max-parallel"];
  if (maxParallel !== undefined && (!Number.isInteger(maxParallel) || (maxParallel as number) <= 0)) {
    fail(file, `job "${jobId}" matrix has a "max-parallel" that isn't a positive integer.`);
  }
  return {
    axes: raw.axes as Record<string, unknown[]>,
    "fail-fast": failFast as boolean | undefined,
    "max-parallel": maxParallel as number | undefined,
  };
}

function validateHttpTrigger(file: string, index: number, raw: Record<string, unknown>): HttpTrigger {
  if (raw.payload !== undefined) {
    if (
      !isRecord(raw.payload) ||
      Object.values(raw.payload).some((v) => typeof v !== "string")
    ) {
      fail(file, `on[${index}].http has a "payload" that isn't a mapping of strings.`);
    }
  }
  return { payload: raw.payload as Record<string, string> | undefined };
}

function validateGithubTrigger(file: string, index: number, raw: Record<string, unknown>): GithubTrigger {
  const push = raw.push;
  const tags = isRecord(push) ? push.tags : undefined;
  if (
    !isRecord(push) || !Array.isArray(tags) || tags.length === 0 ||
    tags.some((t) => typeof t !== "string")
  ) {
    fail(file, `on[${index}].github must declare a non-empty "push.tags" list of strings.`);
  }
  return { push: { tags: tags as string[] } };
}

function validateTrigger(file: string, index: number, raw: unknown): Trigger {
  if (!isRecord(raw)) {
    fail(file, `on[${index}] must be a mapping.`);
  }
  const hasHttp = raw.http !== undefined;
  const hasGithub = raw.github !== undefined;
  if (hasHttp === hasGithub) {
    fail(file, `on[${index}] must have exactly one of "http" or "github".`);
  }
  if (hasHttp && !isRecord(raw.http)) {
    fail(file, `on[${index}].http must be a mapping.`);
  }
  if (hasGithub && !isRecord(raw.github)) {
    fail(file, `on[${index}].github must be a mapping.`);
  }
  return {
    http: hasHttp ? validateHttpTrigger(file, index, raw.http as Record<string, unknown>) : undefined,
    github: hasGithub ? validateGithubTrigger(file, index, raw.github as Record<string, unknown>) : undefined,
  };
}

function validateOn(file: string, raw: unknown): Trigger[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(file, `"on" must be a non-empty list.`);
  }
  return raw.map((t, i) => validateTrigger(file, i, t));
}

function validateJob(file: string, jobId: string, raw: unknown): Job {
  if (!isRecord(raw)) {
    fail(file, `job "${jobId}" must be a mapping.`);
  }
  if (raw.needs !== undefined) {
    if (!Array.isArray(raw.needs) || raw.needs.some((n) => typeof n !== "string")) {
      fail(file, `job "${jobId}" has a "needs" that isn't a list of strings.`);
    }
  }
  if (raw.if !== undefined && typeof raw.if !== "string") {
    fail(file, `job "${jobId}" has a non-string "if".`);
  }
  const matrix = raw.matrix !== undefined ? validateMatrix(file, jobId, raw.matrix) : undefined;
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    fail(file, `job "${jobId}" must have a non-empty "steps" list.`);
  }

  const steps = raw.steps.map((s, i) => validateStep(file, jobId, i, s));

  const seenIds = new Set<string>();
  for (const step of steps) {
    if (step.id === undefined) continue;
    if (seenIds.has(step.id)) {
      fail(file, `job "${jobId}" has a duplicate step id "${step.id}".`);
    }
    seenIds.add(step.id);
  }

  return {
    needs: raw.needs as string[] | undefined,
    if: raw.if as string | undefined,
    matrix,
    steps,
  };
}

/** Reads and validates a workflow YAML file, throwing WorkflowParseError with file context on failure. */
export async function parseWorkflowFile(file: string): Promise<Workflow> {
  const text = await Deno.readTextFile(file);
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    fail(file, `invalid YAML (${error instanceof Error ? error.message : error}).`);
  }

  if (!isRecord(raw) || !isRecord(raw.jobs)) {
    fail(file, `missing top-level "jobs" mapping.`);
  }

  const jobIds = Object.keys(raw.jobs);
  if (jobIds.length === 0) {
    fail(file, `"jobs" must declare at least one job.`);
  }

  const jobs: Record<string, Job> = {};
  for (const jobId of jobIds) {
    jobs[jobId] = validateJob(file, jobId, raw.jobs[jobId]);
  }

  for (const [jobId, job] of Object.entries(jobs)) {
    for (const dep of job.needs ?? []) {
      if (!Object.hasOwn(jobs, dep)) {
        fail(file, `job "${jobId}" needs unknown job "${dep}".`);
      }
    }
  }

  const on = validateOn(file, raw.on);

  return { on, jobs };
}
