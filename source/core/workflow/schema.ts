export interface StepIn {
  /** Name of a resources.repositories entry — this step's cwd defaults to that repository's checkout instead of the run's scratch directory. */
  repository: string;
}

export interface Step {
  id?: string;
  /** Human-readable label for this step, shown in logs. Falls back to the step type ("shell"/"script") when unset. */
  name?: string;
  run?: string;
  script?: string;
  if?: string;
  "continue-on-error"?: boolean;
  /** Runs this step inside a declared resource instead of the run's scratch directory — currently just { repository: <name> }. */
  in?: StepIn;
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
  /** Default `in:` for every step in this job that doesn't declare its own. */
  in?: StepIn;
  steps: Step[];
}

interface ManualInputBase {
  /** Read from the trigger request's `inputs.<name>` and exposed as `trigger.<name>`. */
  name: string;
  /** Human-readable label for a UI to show alongside this input. Purely descriptive — never read by validation. */
  display?: string;
}

export interface ManualStringInput extends ManualInputBase {
  type: "string";
  default?: string;
}

export interface ManualNumberInput extends ManualInputBase {
  type: "number";
  default?: number;
}

export interface ManualBooleanInput extends ManualInputBase {
  type: "boolean";
  default?: boolean;
}

export interface ManualObjectInput extends ManualInputBase {
  type: "object";
  default?: Record<string, unknown>;
}

export interface ManualGitTagsInput extends ManualInputBase {
  type: "git-tags";
  /** Git repo URL a UI can list tags from to offer as a select. Validated as a plain string at trigger time. */
  repository: string;
  default?: string;
}

export interface ManualContextInput extends ManualInputBase {
  type: "context";
  default?: string;
}

/** One input a manual trigger accepts. Required unless `default` is set. `type` governs which extra properties apply. */
export type ManualInput =
  | ManualStringInput
  | ManualNumberInput
  | ManualBooleanInput
  | ManualObjectInput
  | ManualGitTagsInput
  | ManualContextInput;

export interface ManualTrigger {
  /** Named, typed inputs this trigger accepts, read from the trigger request's `inputs.<name>` and exposed as `trigger.<name>`. */
  inputs?: ManualInput[];
}

export interface GithubTrigger {
  push: {
    /** Glob patterns (e.g. "1.*") matched against the pushed tag name. */
    tags: string[];
  };
}

/** Exactly one of "manual" or "github" is set. */
export interface Trigger {
  manual?: ManualTrigger;
  github?: GithubTrigger;
}

export interface RepositoryResource {
  /** Git URL to clone. A value containing $(NAME) is resolved from the process's own env var NAME at parse time. */
  url: string;
  /** Branch, tag, or commit to check out. Defaults to the remote's default branch. */
  ref?: string;
}

export interface Resources {
  /** Repositories to check out automatically before jobs run, keyed by name. Exposed to every job/step as repositories.<name>.path. */
  repositories?: Record<string, RepositoryResource>;
}

export interface Workflow {
  /** Network-facing ways this workflow can be triggered. Absent means it only runs via direct invocation (e.g. `ens workflow <name>`). */
  on?: Trigger[];
  /** Default variables for every job/step in this workflow. A value containing $(NAME) is resolved from the process's own env var NAME at parse time. Overridable by CLI/HTTP-trigger variables. */
  variables?: Record<string, string>;
  /** Declarative resources this workflow needs, prepared automatically before jobs run. */
  resources?: Resources;
  jobs: Record<string, Job>;
}
