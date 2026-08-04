import type { ManualInput } from "@ensemble/workflow";

/** A submitted `inputs` value that fails validation against the workflow's declared `on: - manual: inputs`. */
export class ManualInputError extends Error {}

function matchesType(input: ManualInput, value: unknown): boolean {
  switch (input.type) {
    case "string":
    case "context":
    case "git-tags":
      return typeof value === "string";
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
 * type mismatch, rather than silently coercing or dropping it.
 */
export function extractManualInputs(
  submitted: Record<string, unknown> | undefined,
  declared: ManualInput[],
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
      throw new ManualInputError(`Input "${input.name}" must be a ${input.type}.`);
    }
    trigger[input.name] = value;
  }
  return trigger;
}
