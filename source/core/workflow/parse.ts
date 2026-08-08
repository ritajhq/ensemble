import { parse as parseYaml } from "@std/yaml";
import { findStaticStepReferences } from "./expressions.ts";
import type {
  Context,
  ContextSecret,
  ContextVariable,
  GithubTrigger,
  Job,
  ManualInput,
  ManualTrigger,
  Matrix,
  RepositoryResource,
  Resources,
  Step,
  StepIn,
  Trigger,
  Workflow,
} from "./schema.ts";

const MANUAL_INPUT_TYPES = ["string", "number", "boolean", "object", "git-tags", "context", "job"] as const;

export class WorkflowParseError extends Error {}

function fail(file: string, message: string): never {
  throw new WorkflowParseError(`${file}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateIn(file: string, where: string, raw: unknown): StepIn {
  if (!isRecord(raw)) {
    fail(file, `${where} must be a mapping.`);
  }
  if (typeof raw.repository !== "string" || raw.repository.length === 0) {
    fail(file, `${where} must have a non-empty string "repository".`);
  }
  return { repository: raw.repository };
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
  const stepIn = raw.in !== undefined
    ? validateIn(file, `job "${jobId}" step #${index + 1}'s "in"`, raw.in)
    : undefined;
  return {
    id: raw.id as string | undefined,
    name: raw.name as string | undefined,
    run: raw.run as string | undefined,
    script: raw.script as string | undefined,
    if: raw.if as string | undefined,
    "continue-on-error": continueOnError as boolean | undefined,
    in: stepIn,
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

function validateManualInput(file: string, index: number, inputIndex: number, jobIds: string[], raw: unknown): ManualInput {
  const where = `on[${index}].manual.inputs[${inputIndex}]`;
  if (!isRecord(raw)) {
    fail(file, `${where} must be a mapping.`);
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    fail(file, `${where} must have a non-empty string "name".`);
  }
  if (typeof raw.type !== "string" || !(MANUAL_INPUT_TYPES as readonly string[]).includes(raw.type)) {
    fail(file, `${where} has a "type" that must be one of ${MANUAL_INPUT_TYPES.join(", ")}.`);
  }
  if (raw.display !== undefined && typeof raw.display !== "string") {
    fail(file, `${where} has a non-string "display".`);
  }

  switch (raw.type) {
    case "string":
    case "context":
      if (raw.default !== undefined && typeof raw.default !== "string") {
        fail(file, `${where} has a "default" that isn't a string.`);
      }
      break;
    case "number":
      if (raw.default !== undefined && typeof raw.default !== "number") {
        fail(file, `${where} has a "default" that isn't a number.`);
      }
      break;
    case "boolean":
      if (raw.default !== undefined && typeof raw.default !== "boolean") {
        fail(file, `${where} has a "default" that isn't a boolean.`);
      }
      break;
    case "object":
      if (raw.default !== undefined && !isRecord(raw.default)) {
        fail(file, `${where} has a "default" that isn't a mapping.`);
      }
      break;
    case "git-tags":
      if (typeof raw.repository !== "string" || raw.repository.length === 0) {
        fail(file, `${where} must have a non-empty string "repository".`);
      }
      if (raw.default !== undefined && typeof raw.default !== "string") {
        fail(file, `${where} has a "default" that isn't a string.`);
      }
      break;
    case "job": {
      if (raw.multiple !== undefined && typeof raw.multiple !== "boolean") {
        fail(file, `${where} has a non-boolean "multiple".`);
      }
      const multiple = raw.multiple === true;
      if (raw.default !== undefined) {
        if (multiple) {
          if (!Array.isArray(raw.default) || raw.default.length === 0 || raw.default.some((d) => typeof d !== "string")) {
            fail(file, `${where} has a "default" that isn't a non-empty list of strings.`);
          }
        } else if (typeof raw.default !== "string") {
          fail(file, `${where} has a "default" that isn't a string.`);
        }
        const defaults = Array.isArray(raw.default) ? raw.default as string[] : [raw.default as string];
        for (const jobId of defaults) {
          if (!jobIds.includes(jobId)) {
            fail(file, `${where} has a "default" that isn't a declared job ("${jobId}").`);
          }
        }
      }
      break;
    }
  }

  return raw as unknown as ManualInput;
}

function validateManualTrigger(file: string, index: number, jobIds: string[], raw: Record<string, unknown>): ManualTrigger {
  if (raw.inputs === undefined) return {};
  if (!Array.isArray(raw.inputs)) {
    fail(file, `on[${index}].manual has an "inputs" that isn't a list.`);
  }
  const inputs = raw.inputs.map((input, i) => validateManualInput(file, index, i, jobIds, input));

  const seenNames = new Set<string>();
  for (const input of inputs) {
    if (seenNames.has(input.name)) {
      fail(file, `on[${index}].manual has a duplicate input name "${input.name}".`);
    }
    seenNames.add(input.name);
  }

  return { inputs };
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

function validateTrigger(file: string, index: number, jobIds: string[], raw: unknown): Trigger {
  if (!isRecord(raw)) {
    fail(file, `on[${index}] must be a mapping.`);
  }
  const hasManual = raw.manual !== undefined;
  const hasGithub = raw.github !== undefined;
  if (hasManual === hasGithub) {
    fail(file, `on[${index}] must have exactly one of "manual" or "github".`);
  }
  if (hasManual && !isRecord(raw.manual)) {
    fail(file, `on[${index}].manual must be a mapping.`);
  }
  if (hasGithub && !isRecord(raw.github)) {
    fail(file, `on[${index}].github must be a mapping.`);
  }
  return {
    manual: hasManual ? validateManualTrigger(file, index, jobIds, raw.manual as Record<string, unknown>) : undefined,
    github: hasGithub ? validateGithubTrigger(file, index, raw.github as Record<string, unknown>) : undefined,
  };
}

function validateOn(file: string, jobIds: string[], raw: unknown): Trigger[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(file, `"on" must be a non-empty list.`);
  }
  return raw.map((t, i) => validateTrigger(file, i, jobIds, t));
}

const ENV_REF = /\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g;

/** Resolves $(NAME) references in a variable's value against the process's own env, failing parse if NAME is unset. */
function resolveEnvRefs(file: string, varName: string, value: string): string {
  return value.replace(ENV_REF, (_match, name) => {
    const resolved = Deno.env.get(name);
    if (resolved === undefined) {
      fail(file, `variable "${varName}" references unset env var "${name}" via $(${name}).`);
    }
    return resolved;
  });
}

function validateVariables(file: string, raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.values(raw).some((v) => typeof v !== "string")) {
    fail(file, `"variables" must be a mapping of strings.`);
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, string>)) {
    result[key] = resolveEnvRefs(file, key, value);
  }
  return result;
}

function validateContextVariable(file: string, index: number, raw: unknown): ContextVariable {
  const where = `context.variables[${index}]`;
  if (!isRecord(raw)) {
    fail(file, `${where} must be a mapping.`);
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    fail(file, `${where} must have a non-empty string "name".`);
  }
  if (raw.value !== undefined && typeof raw.value !== "string") {
    fail(file, `${where} has a non-string "value".`);
  }
  if (raw.default !== undefined && typeof raw.default !== "string") {
    fail(file, `${where} has a non-string "default".`);
  }
  return {
    name: raw.name,
    value: raw.value !== undefined ? resolveEnvRefs(file, `context.variables.${raw.name}`, raw.value as string) : undefined,
    default: raw.default as string | undefined,
  };
}

function validateContextVariables(file: string, raw: unknown): ContextVariable[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(file, `"context.variables" must be a non-empty list.`);
  }
  const variables = raw.map((v, i) => validateContextVariable(file, i, v));
  const seenNames = new Set<string>();
  for (const variable of variables) {
    if (seenNames.has(variable.name)) {
      fail(file, `"context.variables" has a duplicate name "${variable.name}".`);
    }
    seenNames.add(variable.name);
  }
  return variables;
}

function validateContextSecret(file: string, index: number, raw: unknown): ContextSecret {
  const where = `context.secrets[${index}]`;
  if (!isRecord(raw)) {
    fail(file, `${where} must be a mapping.`);
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    fail(file, `${where} must have a non-empty string "name".`);
  }
  if (raw.default !== undefined && typeof raw.default !== "string") {
    fail(file, `${where} has a non-string "default".`);
  }
  return { name: raw.name, default: raw.default as string | undefined };
}

function validateContextSecrets(file: string, raw: unknown): ContextSecret[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(file, `"context.secrets" must be a non-empty list.`);
  }
  const secrets = raw.map((s, i) => validateContextSecret(file, i, s));
  const seenNames = new Set<string>();
  for (const secret of secrets) {
    if (seenNames.has(secret.name)) {
      fail(file, `"context.secrets" has a duplicate name "${secret.name}".`);
    }
    seenNames.add(secret.name);
  }
  return secrets;
}

function validateContext(file: string, raw: unknown): Context | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    fail(file, `"context" must be a mapping.`);
  }
  return {
    variables: validateContextVariables(file, raw.variables),
    secrets: validateContextSecrets(file, raw.secrets),
  };
}

function validateRepository(file: string, name: string, raw: unknown): RepositoryResource {
  if (!isRecord(raw)) {
    fail(file, `resources.repositories.${name} must be a mapping.`);
  }
  if (typeof raw.url !== "string" || raw.url.length === 0) {
    fail(file, `resources.repositories.${name} must have a non-empty string "url".`);
  }
  if (raw.ref !== undefined && typeof raw.ref !== "string") {
    fail(file, `resources.repositories.${name} has a non-string "ref".`);
  }
  return {
    url: resolveEnvRefs(file, `resources.repositories.${name}.url`, raw.url),
    ref: raw.ref !== undefined ? resolveEnvRefs(file, `resources.repositories.${name}.ref`, raw.ref as string) : undefined,
  };
}

function validateResources(file: string, raw: unknown): Resources | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    fail(file, `"resources" must be a mapping.`);
  }
  if (raw.repositories === undefined) return {};
  if (!isRecord(raw.repositories) || Object.keys(raw.repositories).length === 0) {
    fail(file, `"resources.repositories" must be a non-empty mapping.`);
  }
  const repositories: Record<string, RepositoryResource> = {};
  for (const [name, repo] of Object.entries(raw.repositories)) {
    repositories[name] = validateRepository(file, name, repo);
  }
  return { repositories };
}

/**
 * Statically checks every `steps.<id>` reference in a job's own `if:` and
 * its steps' `run:`/`name:`/`if:` against step ids actually declared earlier
 * in that same job — matching real runtime semantics exactly (run-job.ts
 * only populates ctx.steps[id] as each step completes, so a job-level `if:`
 * can't see any step, and a step can only see steps before it). Catches a
 * stale/renamed/forward-referenced step id at parse time instead of it
 * silently evaluating to the string "null" at run time (see
 * expressions.ts's findStaticStepReferences for how references are found;
 * this only rejects statically-resolvable references it can prove wrong —
 * a dynamic index like `steps[someExpr]` is never flagged).
 */
function validateStepReferences(file: string, jobId: string, job: Job): void {
  const checkText = (where: string, text: string | undefined, visibleIds: Set<string>) => {
    if (text === undefined) return;
    for (const id of findStaticStepReferences(text)) {
      if (!visibleIds.has(id)) {
        fail(file, `${where} references "steps.${id}", which isn't a step id declared earlier in job "${jobId}".`);
      }
    }
  };

  checkText(`job "${jobId}"'s "if"`, job.if, new Set());

  const visibleIds = new Set<string>();
  for (const [index, step] of job.steps.entries()) {
    const where = `job "${jobId}" step #${index + 1}`;
    checkText(`${where}'s "if"`, step.if, visibleIds);
    checkText(`${where}'s "name"`, step.name, visibleIds);
    checkText(`${where}'s "run"`, step.run, visibleIds);
    if (step.id !== undefined) visibleIds.add(step.id);
  }
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
  const jobIn = raw.in !== undefined ? validateIn(file, `job "${jobId}"'s "in"`, raw.in) : undefined;
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

  const job: Job = {
    needs: raw.needs as string[] | undefined,
    if: raw.if as string | undefined,
    matrix,
    in: jobIn,
    steps,
  };
  validateStepReferences(file, jobId, job);
  return job;
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

  const on = validateOn(file, jobIds, raw.on);
  const variables = validateVariables(file, raw.variables);
  const resources = validateResources(file, raw.resources);
  const context = validateContext(file, raw.context);

  return { on, variables, resources, context, jobs };
}
