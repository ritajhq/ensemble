import type { ManualInput } from "@ensemble/workflow";

/** A submitted `inputs` value that fails validation against the workflow's declared `on: - manual: inputs`. */
export class ManualInputError extends Error {}

function matchesType(input: ManualInput, value: unknown): boolean {
  switch (input.type) {
    case "string":
    case "context":
    case "git-tags":
      return typeof value === "string";
    case "job":
      return input.multiple
        ? Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string")
        : typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

/**
 * Validates a trigger request's `inputs` against the workflow's declared
 * `on: - manual: inputs`, applying defaults and requiring any input with no
 * `default` to be present — then builds `trigger.<name>` for each. Throws
 * ManualInputError (caller maps to 400) on a missing required input or a
 * type mismatch, rather than silently coercing or dropping it. `jobIds` is
 * the triggered workflow's own job ids, used to validate any `type: "job"`
 * input's value(s) — such an input's declared `default` is already checked
 * at parse time, but a submitted value is only known at trigger time.
 */
export function extractManualInputs(
  submitted: Record<string, unknown> | undefined,
  declared: ManualInput[],
  jobIds: string[] = [],
): Record<string, unknown> {
  const trigger: Record<string, unknown> = {};
  for (const input of declared) {
    const value = submitted?.[input.name];
    if (value === undefined) {
      if (input.default === undefined) {
        throw new ManualInputError(`Missing required input "${input.name}".`);
      }
      trigger[input.name] = input.default;
      continue;
    }
    if (!matchesType(input, value)) {
      const expected = input.type === "job" && input.multiple ? "non-empty list of job ids" : input.type;
      throw new ManualInputError(`Input "${input.name}" must be a ${expected}.`);
    }
    if (input.type === "job") {
      const submittedJobs = Array.isArray(value) ? value as string[] : [value as string];
      const unknown = submittedJobs.find((j) => !jobIds.includes(j));
      if (unknown !== undefined) {
        throw new ManualInputError(`Input "${input.name}" must be a declared job ("${unknown}").`);
      }
    }
    trigger[input.name] = value;
  }
  return trigger;
}

/**
 * The value of the trigger's first `type: "job"` input, if it declared one —
 * this is what "a job input implicitly means what job to run" resolves to:
 * a caller uses this as the run's job filter (RunWorkflowOptions.job)
 * instead of requiring a separate, redundant job selector. Resolves to a
 * single job id, or a list when that input declared `multiple: true`.
 */
export function resolveJobInput(
  declared: ManualInput[],
  trigger: Record<string, unknown>,
): string | string[] | undefined {
  const jobInput = declared.find((input): input is Extract<ManualInput, { type: "job" }> => input.type === "job");
  return jobInput ? trigger[jobInput.name] as string | string[] : undefined;
}
