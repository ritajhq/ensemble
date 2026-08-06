import { parse as parseYaml } from "@std/yaml";
import type {
  ContextEntry,
  Contexts,
  GithubTrigger,
  Job,
  ManualInput,
  ManualTrigger,
  Matrix,
  RemoteContextSource,
  RepositoryResource,
  Resources,
  Step,
  StepIn,
  Trigger,
  Workflow,
} from "./schema.ts";

const MANUAL_INPUT_TYPES = ["string", "number", "boolean", "object", "git-tags", "context"] as const;

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

function validateManualInput(file: string, index: number, inputIndex: number, raw: unknown): ManualInput {
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
  }

  return raw as unknown as ManualInput;
}

function validateManualTrigger(file: string, index: number, raw: Record<string, unknown>): ManualTrigger {
  if (raw.inputs === undefined) return {};
  if (!Array.isArray(raw.inputs)) {
    fail(file, `on[${index}].manual has an "inputs" that isn't a list.`);
  }
  const inputs = raw.inputs.map((input, i) => validateManualInput(file, index, i, input));

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

function validateTrigger(file: string, index: number, raw: unknown): Trigger {
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
    manual: hasManual ? validateManualTrigger(file, index, raw.manual as Record<string, unknown>) : undefined,
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

function validateRemoteContextSource(file: string, name: string, raw: unknown): RemoteContextSource {
  const where = `contexts.entries.${name}.remote`;
  if (!isRecord(raw)) {
    fail(file, `${where} must be a mapping.`);
  }
  if (typeof raw.url !== "string" || raw.url.length === 0) {
    fail(file, `${where} must have a non-empty string "url".`);
  }
  if (raw.ref !== undefined && typeof raw.ref !== "string") {
    fail(file, `${where} has a non-string "ref".`);
  }
  if (raw.path !== undefined && typeof raw.path !== "string") {
    fail(file, `${where} has a non-string "path".`);
  }
  return {
    url: resolveEnvRefs(file, `${where}.url`, raw.url),
    ref: raw.ref !== undefined ? resolveEnvRefs(file, `${where}.ref`, raw.ref as string) : undefined,
    path: raw.path as string | undefined,
  };
}

function validateContextEntry(file: string, name: string, raw: unknown): ContextEntry {
  const where = `contexts.entries.${name}`;
  if (!isRecord(raw)) {
    fail(file, `${where} must be a mapping.`);
  }
  if (raw.local !== undefined && typeof raw.local !== "string") {
    fail(file, `${where} has a non-string "local".`);
  }
  if (raw.local === undefined && raw.remote === undefined) {
    fail(file, `${where} must have at least one of "local" or "remote".`);
  }
  return {
    local: raw.local as string | undefined,
    remote: raw.remote !== undefined ? validateRemoteContextSource(file, name, raw.remote) : undefined,
  };
}

function validateContexts(file: string, raw: unknown): Contexts | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    fail(file, `"contexts" must be a mapping.`);
  }
  if (!isRecord(raw.entries) || Object.keys(raw.entries).length === 0) {
    fail(file, `"contexts.entries" must be a non-empty mapping.`);
  }
  const entries: Record<string, ContextEntry> = {};
  for (const [name, entry] of Object.entries(raw.entries)) {
    entries[name] = validateContextEntry(file, name, entry);
  }
  if (raw.default !== undefined) {
    if (typeof raw.default !== "string") {
      fail(file, `"contexts.default" must be a string.`);
    }
    if (!Object.hasOwn(entries, raw.default)) {
      fail(file, `"contexts.default" references unknown context "${raw.default}".`);
    }
  }
  return { default: raw.default as string | undefined, entries };
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

  return {
    needs: raw.needs as string[] | undefined,
    if: raw.if as string | undefined,
    matrix,
    in: jobIn,
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
  const variables = validateVariables(file, raw.variables);
  const resources = validateResources(file, raw.resources);
  const contexts = validateContexts(file, raw.contexts);

  return { on, variables, resources, contexts, jobs };
}
