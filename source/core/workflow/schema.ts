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

export interface HttpTrigger {
  /** Maps trigger.<key> to a dot-path into the incoming request's "payload" field. */
  payload?: Record<string, string>;
}

export interface GithubTrigger {
  event: {
    push: {
      /** Glob patterns (e.g. "1.*") matched against the pushed tag name. */
      tags: string[];
    };
  };
}

/** Exactly one of "http" or "github" is set. */
export interface Trigger {
  http?: HttpTrigger;
  github?: GithubTrigger;
}

export interface Workflow {
  /** Network-facing ways this workflow can be triggered. Absent means it only runs via direct invocation (e.g. `ens workflow <name>`). */
  on?: Trigger[];
  jobs: Record<string, Job>;
}
