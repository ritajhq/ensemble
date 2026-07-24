export interface Step {
  id?: string;
  run?: string;
  script?: string;
  if?: string;
  "continue-on-error"?: boolean;
}

export interface Matrix {
  axes: Record<string, unknown[]>;
  /** Cancel not-yet-started sibling instances when one hard-fails. Defaults to true. */
  "fail-fast"?: boolean;
  /** Cap how many of this job's instances run concurrently. Defaults to unbounded. */
  "max-parallel"?: number;
}

export interface Job {
  needs?: string[];
  if?: string;
  matrix?: Matrix;
  steps: Step[];
}

export interface Workflow {
  jobs: Record<string, Job>;
}
