import type { ProbeResult } from "./ports.ts";

/** A kit's answer to "may this machine publish there?" — `reason` explains a refusal. */
export interface Authorization {
  readonly granted: boolean;
  readonly reason?: string;
}

/** Reads a kit's authorization check outcome: exit 0 grants, anything else denies, with whatever the kit printed to stderr as the reason. */
export function authorizationFrom(result: ProbeResult): Authorization {
  if (result.code === 0) return { granted: true };
  return {
    granted: false,
    reason: result.stderr || `check exited with code ${result.code}`,
  };
}

/** One configured publish this machine isn't allowed to perform — `publish` names what and where (e.g. `cli → github`). */
export interface Denial {
  readonly publish: string;
  readonly reason: string;
}

/**
 * Thrown before a release changes anything when this machine isn't allowed
 * to perform one or more of its configured publishes — write access to the
 * destinations is what decides who may release, so a developer without it
 * can still run the release command but gets refused up front instead of
 * half-way through.
 */
export class PublishUnauthorizedError extends Error {
  constructor(readonly denials: readonly Denial[]) {
    super(
      `Not authorized to publish from this machine:\n${
        denials.map((denial) => `  ${denial.publish}: ${denial.reason}`)
          .join("\n")
      }`,
    );
    this.name = "PublishUnauthorizedError";
  }
}
