import { describeProblems, type Problem } from "../problem.ts";

/** Raised for any structural problem in a manifest: missing/unsupported `version`, an unknown envelope or category key, or a malformed resource. Carries every problem found, each a legible sentence naming the offending path; the message lists them one per line. */
export class ManifestError extends Error {
  constructor(readonly problems: readonly Problem[]) {
    super(describeProblems(problems));
    this.name = "ManifestError";
  }
}
