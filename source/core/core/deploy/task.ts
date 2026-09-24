/**
 * A named operator command attached to a workload's delivery: a step that
 * isn't provisioning — the deployment is complete and usable without it — and
 * that no target's kit can express, because it's about *this* environment
 * rather than about the artifacts: a schema migration against a
 * just-deployed database, trusting a dev gateway's CA on your own machine,
 * regenerating seed data.
 *
 * Declared in the manifest so it travels with the workload instead of living
 * in a loose `ci/<workload>/scripts/` file whose name nothing else knows, but
 * invoked explicitly (`ens delivery task <name> <kit> <task>`) rather than
 * fired by a deploy. That split is the point: a kit's own init commands are
 * provisioning — the deploy must run them every time to be correct, and the
 * target knows how — while an operator step is a decision, and running
 * manifest shell on every apply, against whichever environment the apply
 * happened to target, is the exact shape a data migration must not have.
 */
export interface Task {
  /** A `sh -c` script, for a step short enough to read inline. Mutually exclusive with `script`. */
  readonly run?: string;
  /** A shell file under `ci/<workload>/scripts/`, run as `sh <path>` — the file carries its own shebang; the core never relies on it. Mutually exclusive with `run`. */
  readonly script?: string;
  /**
   * Name → value, handed to the task as environment variables under exactly
   * these names. Each value is a literal, or a `${...}` reference the core
   * resolves when the task is invoked: anything a resource's own fields may
   * reference (`${compute.web.http}`, `${databases.db.host}`,
   * `${variables.env.value}`, `${storage.bucket.url}`), plus the deployment's
   * own identity — `${deployment.name}` (the compose project / deployment
   * name), `${deployment.artifact}` (the rendered document's path) and
   * `${deployment.root}` (the workspace root) — which is what lets a task
   * address its own stack without hardcoding a generated name.
   *
   * A name must be a shell-safe identifier, because it *becomes* a variable
   * name: `$database-host` reads as `$database` followed by a literal `-host`.
   */
  readonly arguments?: Readonly<Record<string, string | number | boolean>>;
}
