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

export interface ManualJobInput extends ManualInputBase {
  type: "job";
  /** Accept/require a list of job ids instead of one. Defaults to false (single job). */
  multiple?: boolean;
  /** A job id (or, when `multiple` is true, a non-empty list of job ids) — each must be one of this workflow's own job ids. */
  default?: string | string[];
}

/** One input a manual trigger accepts. Required unless `default` is set. `type` governs which extra properties apply. */
export type ManualInput =
  | ManualStringInput
  | ManualNumberInput
  | ManualBooleanInput
  | ManualObjectInput
  | ManualGitTagsInput
  | ManualContextInput
  | ManualJobInput;

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

export interface RemoteContextSource {
  /** Git URL to clone. A value containing $(NAME) is resolved from the process's own env var NAME at parse time. */
  url: string;
  /** Branch, tag, or commit to check out. Defaults to the remote's default branch. */
  ref?: string;
  /** Subdirectory within the cloned repo this context's files live under. Defaults to the repo root. */
  path?: string;
}

/** At least one of `local`/`remote` must be set. Both together: local's files are resolved first, then remote's are copied on top (same-relative-path files from remote win). */
export interface ContextEntry {
  /** Path relative to the workflow's own folder, e.g. "./contexts/production" — the same convention `context.path` has always resolved to for a workflow-local context. */
  local?: string;
  /** A separately-versioned repo this context's files live in (e.g. one holding secrets/tfvars kept out of the source repo). */
  remote?: RemoteContextSource;
}

export interface Contexts {
  /** Context name used when the caller doesn't pass --context. Must be a key in `entries`. */
  default?: string;
  /** Named contexts this workflow accepts. Once declared, a run of this workflow requires a context (an explicit --context, or `default` above) — an unrecognized or missing context fails before any job runs. */
  entries: Record<string, ContextEntry>;
}

export interface Workflow {
  /** Network-facing ways this workflow can be triggered. Absent means it only runs via direct invocation (e.g. `ens workflow <name>`). */
  on?: Trigger[];
  /** Default variables for every job/step in this workflow. A value containing $(NAME) is resolved from the process's own env var NAME at parse time. Overridable by CLI/HTTP-trigger variables. */
  variables?: Record<string, string>;
  /**
   * Names of env vars from the process's own environment this workflow's
   * steps may read (e.g. ["REGISTRY_USERNAME", "REGISTRY_PASSWORD"]).
   * Declaring this scopes every step down to just these names instead of the
   * whole process environment — a run fails fast, before any job starts, if
   * a declared name isn't actually set. Absent means the legacy behavior:
   * every step sees the whole process environment, unscoped.
   */
  secrets?: string[];
  /** Declarative resources this workflow needs, prepared automatically before jobs run. */
  resources?: Resources;
  /** Named deploy contexts this workflow accepts. Declaring this makes --context required for every run (subject to `default`). */
  contexts?: Contexts;
  jobs: Record<string, Job>;
}
