# @ensemble/workflow

A minimal CI-style pipeline/workflow runner: YAML workflow files, jobs, steps,
`needs`, `if:` conditions, `${{ }}` expressions, and outputs passed between
steps — in the spirit of GitHub Actions, but with no `uses:`, no actions
marketplace, and no per-step Docker/runner-registration protocol. A step is
just a local TypeScript module with a `run()` function, or a raw shell
command; `runWorkflow` here always executes them the same way (in-process,
subprocess-per-step) regardless of caller. Whether a whole *run* happens
inside a container is a decision made one layer up, by `@ensemble/core`'s
`runWorkflowByName` — see its own doc comment and `@ensemble/platform`'s
README for where/why that applies (server-triggered runs only; this
package and a plain local `ens workflow` run are unaffected).

Expression parsing/evaluation is delegated to `npm:@actions/expressions`
(MIT licensed, from `actions/languageservices`) rather than reimplemented.
Everything else is hand-rolled on top of the Deno standard library.

## Running a workflow

Through the `ens` CLI, workflows live under `workflows/<name>/workflow.yml`
at the repo root:

```
ens workflow deploy
ens workflow deploy --job build
ens workflow deploy --concurrency 2
ens workflow deploy --context production
ens workflow deploy -v GREETING=hi -v API_URL=https://staging.example.com
ens workflow deploy -i sha=abc123 -i replicas=3
```

`--job <id>` runs only that job and its transitive dependencies. Script
paths inside a workflow (`script: ./steps/build.ts`) resolve relative to
that workflow's own folder.

`--context <name>` is a deploy-context marker: it's exposed to every
job/step as `context.name` (the name itself, e.g. `"production"`) and
`context.path` (an absolute path to that context's own folder, resolved
regardless of a step's own `cwd`). A workflow with no `contexts:` block
gets the simple legacy behavior — `context.path` is just `<repoRoot>/contexts/<name>`,
unvalidated, and it's entirely up to the workflow's own steps to use
whatever's there. A workflow that declares `contexts:` gets more: a
required, validated, checked-out-per-run context — see "Contexts
(`contexts:`)" below.

`-e KEY=VALUE` (repeatable) overrides a workflow variable for this run
only — see "Variables" below for how it fits into the overall precedence
chain. It works the same way whether the workflow runs locally or via
`--remote` (forwarded as the manual trigger's `variables` body field).
`-i NAME=VALUE` (repeatable) sets a value for the workflow's declared
`manual` trigger inputs — see "Triggers (`on:`)" below.

## Workflow YAML shape

```yaml
jobs:
  build:
    steps:
      - id: compile
        script: ./steps/build.ts
      - run: echo "build finished"
        if: ${{ steps.compile.outputs.ok == 'true' }}

  test:
    needs: [build]
    steps:
      - script: ./steps/test.ts
        continue-on-error: true

  deploy:
    needs: [build, test]
    if: ${{ needs.test.result == 'success' }}
    steps:
      - run: echo "deploying"
```

- `needs:` builds the job DAG. Jobs with no dependency relationship run
  concurrently (in the same "batch"); a cycle fails loudly before anything
  runs.
- `if:` (job-level or step-level) is evaluated with `@actions/expressions`.
  Both `${{ expr }}` and bare `expr` are accepted. GitHub Actions truthiness
  applies: `false`, `0`, `NaN`, `""`, and `null` are falsy, everything else
  (including non-empty strings/objects/arrays) is truthy.
- A step is exactly one of:
  - `run: <shell command>` — executed as a subprocess (`/bin/sh -c` or
    `cmd /c` on Windows), inheriting stdout/stderr. Its outputs come from
    `$WORKFLOW_OUTPUT`, a path the engine sets in the subprocess's own env:
    appending `key=value` lines to that file (`echo "tag=1.2.3" >>
    "$WORKFLOW_OUTPUT"`) becomes that step's `Record<string,string>` outputs,
    the same shape a `script:` step returns — mirrors GitHub Actions'
    `$GITHUB_OUTPUT` convention. Blank lines and lines without a non-empty
    key are ignored rather than failing the step.
  - `script: ./path/to/file.ts` — also executed as its own subprocess
    (`deno run -A`, real Deno permissions), so it's genuinely killable —
    this is what makes matrix `fail-fast` actually work, not just skip
    not-yet-started siblings. Must export a `run(ctx)` function; its
    returned `Record<string,string>` (or `void`) becomes that step's
    outputs. `ctx` crosses a real process boundary as plain JSON — see
    "The `script:` module contract" below.
- `continue-on-error: true` on a step means the step's own failure doesn't
  fail the job — but it's still recorded as `failure` for that step, so
  later steps can check it via `steps.<id>.outputs`/logs if needed.
- A job's `result` is `success`, `failure`, or `skipped`, so
  `needs.<job>.result` is meaningful downstream. A job whose dependencies
  didn't all succeed is **skipped**, not run — matching Actions' default
  behavior. There's no `always()`/`failure()` yet (see below).

## Resources (`resources:`)

A workflow can declare `resources.repositories` — git repositories checked
out automatically before any job runs, so a workflow doesn't need a
hand-rolled `run: git clone ...` step:

```yaml
resources:
  repositories:
    ensemble:
      url: https://github.com/ritajhq/ensemble.git
      ref: main   # optional; branch/tag/commit, defaults to the remote's default branch

jobs:
  release:
    in:
      repository: ensemble   # every step in this job defaults to running inside the checkout
    steps:
      - run: git describe --tags --abbrev=0
```

- Cloned once per run, sequentially, into `<runDir>/repos/<name>` — a full
  clone, not shallow, since steps commonly need tag history (`git describe`,
  changelog generation).
- Exposed as `${{ repositories.<name>.path }}` in expressions/`run:`/`name:`
  interpolation, and `ctx.repositories.<name>.path` in `script:` steps —
  see "Expression contexts" below.
- **`in: { repository: <name> }`** (on a job or a step) defaults that
  job's/step's `cwd` to the named repository's checkout instead of the run's
  scratch directory — the usual reason to declare `resources.repositories`
  in the first place, so steps don't each need their own `cd
  ${{ repositories.<name>.path }}`. Job-level `in:` applies to every step
  that doesn't declare its own; a step's own `in:` always wins over the
  job's. `name` must be a key under `resources.repositories` — referencing
  anything else is a `WorkflowExpressionError`.
- **Local dev**: `.ensemble/config.local.yaml` (gitignored, per-developer)
  can override a repository name to point at an existing local directory
  instead of cloning:
  ```yaml
  workflows:
    repositories:
      ensemble: /home/you/ritaj/ensemble
  ```
  This is what makes "the same workflow runs everywhere" actually true in
  practice — the exact same `workflow.yml` clones fresh on a server/CI run,
  but operates on your live working tree (uncommitted changes included)
  when you run it locally, with zero workflow-file changes either way.

`resources.repositories` is for **source** — the code being built/deployed.
It's deliberately not overloaded to also carry deploy config/secrets: those
have a different lifecycle (change rarely, often need tighter access
control) and belong under `contexts:` instead — see below.

## Contexts (`contexts:`)

A workflow can declare `contexts:` to turn `--context` from an unvalidated
free-form marker (see "Running a workflow" above) into a required, checked
set of named environments, each with its own on-disk folder prepared before
any job runs:

```yaml
contexts:
  default: production   # optional — --context can be omitted when this is set
  entries:
    production:
      local: ./contexts/production        # workflow-relative, like the legacy path
    staging:
      remote:
        url: https://github.com/ritajhq/ensemble-deploy-config.git
        path: staging                      # subdirectory within that repo
        ref: main                          # optional, same shape as resources.repositories

jobs:
  deploy:
    steps:
      - run: cat ${{ context.path }}/secrets.json
```

- **Requires a context once declared**: `--context <name>` (or
  `contexts.default`, if set) must resolve to a key in `contexts.entries` —
  missing or unrecognized fails immediately, before any job runs, not
  wherever a step first happens to reference `context.*`.
- **`local:`** is a path relative to the workflow's own folder — the same
  convention the legacy `context.path` always implied, just now actually
  validated and copied into the run's own scratch dir rather than referenced
  in place.
- **`remote:`** clones a separately-versioned repo — the point being: things
  like production secrets/tfvars often shouldn't live in the same repo (same
  access-control boundary, same commit history) as source. `path:` picks a
  subdirectory within that repo, for a config repo that holds multiple
  contexts' files.
- **Both together**: `local:`'s files are copied in first, then `remote:`'s
  are copied on top — same-relative-path files from `remote:` win. Useful
  for "structural config lives with the workflow (a Caddyfile, non-sensitive
  layout), secrets come from a separately-permissioned repo" without having
  to duplicate the structural half into the secrets repo too.
- Either way, `context.path` is one real directory on disk, populated fresh
  per run into `<runDir>/contexts/<name>` — steps never need to know whether
  it came from `local:`, `remote:`, or both.
- A workflow with no `contexts:` block at all keeps today's simple behavior
  exactly: `--context <name>` is optional and unvalidated, `context.path` is
  just `<repoRoot>/contexts/<name>` (see "Running a workflow" above).

## Variables

A workflow can declare default variables, available to every job/step as
`variables.*` in expressions and as real subprocess env vars in `run:`
steps:

```yaml
variables:
  GREETING: hello
  API_URL: "https://example.com"
  DEPLOY_TOKEN: "$(DEPLOY_TOKEN)"

jobs:
  build:
    steps:
      - name: "Deploy ${{ variables.GREETING }}"
        run: echo "${{ variables.GREETING }} to ${{ variables.API_URL }}"
```

- Values are plain strings. `$(NAME)` anywhere in a value is replaced with
  the process's own env var `NAME` **at parse time** — it's a lookup, not a
  shell subshell execution. A `$(NAME)` referencing an unset env var fails
  parsing immediately (`WorkflowParseError`), rather than silently
  resolving to `""`.
- Precedence, lowest to highest: the process's own `Deno.env` → this
  `variables:` block → whatever the caller supplies at run time (the CLI's
  repeatable `-e KEY=VALUE`, or the HTTP trigger's `variables` body field,
  or `RunWorkflowOptions.variables` when calling the engine directly). Any
  layer can override a name set by a lower one.
- `${{ }}` expressions are interpolated into a step's `run:` command and
  `name:` label before either is used — unlike `if:`, which only ever
  evaluates a single expression, `run:`/`name:` can mix literal text with
  multiple `${{ }}` occurrences (e.g. `"${{ variables.A }}-${{ variables.B }}"`).
  A non-string expression result is stringified. `script:` steps don't need
  this — they already receive the full context as structured JSON (see
  "The `script:` module contract" below).

## Matrix jobs

A job can declare a `matrix:` — a set of variable axes — and run its steps
once per combination, concurrently:

```yaml
jobs:
  build:
    matrix:
      axes:
        component: [api, web, worker]
      fail-fast: true    # default; cancels not-yet-started siblings on a hard failure
      max-parallel: 2    # default: unbounded (still capped by --concurrency)
    steps:
      - script: ./steps/build.ts   # ctx.matrix.component is "api"/"web"/"worker"

  check-one:
    needs: [build]
    steps:
      - script: ./steps/check-one.ts   # ctx.needs.build.outputs.image[1]
```

Each combination is an **instance**: a full, isolated run of the job's
steps with its own `matrix` context and its own step outputs — instances
never see each other's state. `axes:` is the only required key; both
`fail-fast` and `max-parallel` are optional.

- **`fail-fast`** (default `true`): when any instance hard-fails (a step
  failure without `continue-on-error:`), instances of the *same job* that
  haven't started yet are skipped, reported with a `"cancelled"` result —
  distinct from `"skipped"` (which means a *declared dependency* failed).
  Already-in-flight instances are **genuinely killed**, not just abandoned:
  `script:` steps run as real subprocesses specifically so this works —
  a killed instance's exit code reflects the signal (e.g. 143 for
  SIGTERM), not a script-level error. Set `fail-fast: false` to let every
  instance always run to completion regardless of its siblings.
- **`max-parallel`**: caps how many of *this job's own* instances run
  concurrently, independent of (and additionally to) the global
  `--concurrency` — e.g. `max-parallel: 2` with `--concurrency 10` still
  only runs 2 of this job's instances at a time, even if 10 other unrelated
  jobs could otherwise run in parallel with them.

**`needs.<job>` on a matrixed upstream is array-shaped**, not a single
`{result, outputs}` like a non-matrixed job:

```jsonc
{
  "result": "success",              // success only if every instance succeeded
  "matrix": [{ "component": "api" }, { "component": "web" }, { "component": "worker" }],
  "results": ["success", "success", "failure"],
  "outputs": { "image": ["myregistry/api:sha", "myregistry/web:sha", undefined] }
}
```

`matrix[i]`, `results[i]`, and `outputs.<name>[i]` are all indexed by the
same order: the job's Cartesian-product **generation** order (declaration
order of matrix keys, then array order of each key's values) — fixed by
the workflow definition, never by which instance happens to finish first
at runtime. **This is a deliberate departure from GitHub Actions**, whose
own `needs.<job>.outputs` on a matrixed job collapses every instance's
same-named output into one value, last-to-finish silently wins — a race
on completion timing. Here, nothing is ever overwritten or lost: every
instance's data is reachable by its fixed index, from both expressions
(`needs.build.outputs.image[1]`) and `script:` steps
(`ctx.needs.build.outputs.image`, a plain array to loop over in real
TypeScript — useful for aggregation that's awkward to express in the
restricted expression grammar, e.g. building a combined summary from
every instance's outputs).

No `include`/`exclude` matrix extensions (see Known Limitations).

## Triggers (`on:`)

A workflow can declare `on:` — a list of network-facing ways it can be
triggered (by the `@ensemble/platform` server's `workflow` feature, not by
this package itself, which only *consumes* the resulting data). A workflow
with no `on:` still runs fine via direct invocation (`ens workflow <name>`
or `runWorkflowByName`) — `on:` only governs whether/how a server-side
trigger is allowed to start it, and what ends up in `trigger.*`:

```yaml
on:
  - manual:
      inputs:
        - name: sha
          type: string
        - name: replicas
          type: number
          default: 1
        - name: release_tag
          type: git-tags
          repository: https://github.com/org/repo.git
          display: "Tag to release"
  - github:
      push:
        tags: ["1.*"]

jobs:
  deploy:
    steps:
      - script: ./steps/deploy.ts   # ctx.trigger.sha / ctx.trigger.replicas / ctx.trigger.type
```

- **`manual`**: declaring this entry is what allows the platform's trigger
  endpoint (`POST /v1/workflows/:id/trigger`, or `ens workflow <name>
  --remote <profile>`) to run this workflow at all — a request for a
  workflow with no `manual` entry is rejected. `inputs:` is an optional
  list of named, typed values the caller must (or may) supply, each read
  from the trigger request's `inputs.<name>` and exposed as `trigger.<name>`:
  - **`name`** and **`type`** are required on every input. `type` is one of
    `string`, `number`, `boolean`, `object`, `git-tags`, `context`.
  - **`default`**: makes the input optional — omitted from the request
    means `trigger.<name>` falls back to this value. An input with no
    `default` is **required**; a request missing it is rejected with 400.
  - **`display`**: a human-readable label for a UI to show alongside this
    input. Purely descriptive — never read by validation.
  - A submitted value is checked against `type` with a **strict** match
    (e.g. `type: number` rejects the string `"3"`) — no silent coercion.
    `git-tags` and `context` validate as plain strings; `git-tags`
    additionally requires a **`repository`** property (a git URL) so a UI
    can list that repo's tags to offer as a select, and `context` is a
    context name (see `--context`/`context.*` above) with no extra
    property, since which contexts exist isn't an enumerated registry
    today.
  - Locally, `ens workflow <name> -i NAME=VALUE` (repeatable) sets input
    values the same way — `VALUE` is JSON-parsed when possible (so
    `-i replicas=3` yields the number `3`, `-i enabled=true` the boolean
    `true`), falling back to the raw string otherwise (so `-i sha=abc123`
    works unquoted).
- **`github`**: matches a GitHub `push` webhook whose pushed ref is a tag
  matching one of the given glob patterns (`tags: ["1.*"]`). `trigger.ref`,
  `trigger.tag`, and `trigger.sha` are populated automatically from the
  webhook's own payload (`ref`, the tag parsed out of it, and `after`) —
  there's no user-declared input list for `github` today, unlike `manual`.
  Only the `push`/`tags` shape is supported for now; other GitHub events
  are a future extension of this same `github:` block.

`trigger.type` is always set to `"manual"` or `"github"` alongside
whatever else that trigger kind populates, so steps/`if:` can branch on
how the run was started (e.g. `if: trigger.type == 'github'`).

Each `on:` entry is exactly one of `manual` or `github` — declare multiple
list entries (one per trigger) if a workflow should be reachable more than
one way.

## The `script:` module contract

```ts
// steps/build.ts
import type { StepContext } from "@ensemble/workflow";

export async function run(ctx: StepContext): Promise<Record<string, string>> {
  // ctx.variables - the job's variables (defaults to the process's env vars)
  // ctx.needs - already-completed jobs' results/outputs (plain objects,
  //   array-shaped for a matrixed upstream — see "Matrix jobs")
  // ctx.matrix - this instance's own combination (only present in a
  //   matrixed job's own steps)
  // ctx.trigger - data from whatever triggered this run (see "Triggers"),
  //   only present when the run actually came through a trigger; always
  //   includes trigger.type ("manual" or "github")
  // ctx.context - { name, path } for the deploy context this run was
  //   invoked with (--context), only present when one was given
  // ctx.repositories - { <name>: { path } } for each resources.repositories
  //   entry, only present when the workflow declares at least one
  return { ok: "true" };
}
```

`script:` steps run as their own `deno run -A` subprocess (see "Matrix
jobs" — this is what makes `fail-fast` a genuine kill rather than a
best-effort skip). `ctx` crosses that process boundary as plain JSON, so
it's data only — there's no `ctx.evaluate()` here; read `matrix`/`needs`
values with ordinary property/array access instead of an expression
string. `console.log`/`console.error` inside a script still work exactly
as before (they're inherited straight through to the job's log block) —
the step's *return value* is carried back over a separate channel, so
your own logging never collides with it.

Returning `undefined`/nothing is fine for steps that don't produce outputs.
A thrown error fails the step (subject to `continue-on-error:`); a script
killed by fail-fast exits via its process signal, not a normal error.

## Expression contexts

- `variables.*` — the run's variables: the process's own env vars, then
  the workflow's own `variables:` block, then any caller-supplied
  overrides (`RunWorkflowOptions.variables`, the CLI's `-v`, or a manual
  trigger's `variables`) — see "Variables" above for the full precedence
  chain. Also available for interpolation (not just `if:`) inside a
  step's `run:` and `name:`.
- `needs.<job>.result` / `needs.<job>.outputs.*` — already-completed jobs
  (array-shaped per-key if `<job>` is matrixed — see "Matrix jobs").
- `steps.<id>.outputs.*` — steps completed earlier in the *same* job (only
  steps with an explicit `id:` are addressable).
- `matrix.*` — the current instance's own combination, only present inside
  a matrixed job's own steps/`if:` (absent, and therefore an error to
  reference, everywhere else).
- `trigger.*` — data from whatever triggered this run (see "Triggers
  (`on:`)"), only present when `RunWorkflowOptions.trigger` was passed in;
  absent (and therefore an error to reference) for a direct/untriggered run.
  `trigger.type` is always `"manual"` or `"github"` when present.
- `context.name` / `context.path` — the deploy context this run was
  invoked with (`--context <name>`, or `RunWorkflowOptions.context`), only
  present when one was given; absent (and therefore an error to reference)
  otherwise. Unlike `variables.*`, `context` isn't overridable per-name and
  isn't injected as shell env — it's just these two fields.
- `repositories.<name>.path` — where a `resources.repositories` entry was
  checked out (see "Resources" above), only present when the workflow
  declares at least one. `in: { repository: <name> }` on a job/step is the
  common way to use this (defaulting that job's/step's `cwd` to it); the
  path is also usable directly, e.g. `run: cat ${{ repositories.ensemble.path }}/CHANGELOG.md`.

Referencing an unrecognized context path (e.g. `nonexistent.path`) throws a
`WorkflowExpressionError` immediately — it does not silently evaluate to
`undefined` and continue.

## Programmatic API

```ts
import { parseWorkflowFile, runWorkflow } from "@ensemble/workflow";

const workflow = await parseWorkflowFile("workflows/deploy/workflow.yml");
const { outcomes, success } = await runWorkflow(workflow, {
  workflowDir: "workflows/deploy",
  job: undefined, // or a job id to run just that job + its deps
  concurrency: undefined, // or a number to cap concurrent jobs per batch
  variables: undefined, // or overrides, layered on top of Deno.env + workflow.variables
  context: undefined, // or a plain context name (e.g. "production") — resolved/validated internally against workflow.contexts, see "Contexts" above
  repoRoot: undefined, // or the repo root, only used for a workflow with no `contexts:` (the legacy <repoRoot>/contexts/<name> path)
  localRepositoryOverrides: undefined, // or { <name>: /local/path }, from .ensemble/config.local.yaml — see "Resources" above
});
```

## Known limitations / future work

- No `include`/`exclude` matrix extensions.
- Fail-fast cancellation is instance-boundary-plus-signal: not-yet-started
  siblings are skipped, and in-flight siblings' subprocess steps are
  genuinely killed (`Deno.Command`'s `signal` option). What *isn't*
  killed: a script that spawns its own long-lived subprocess or ignores
  the kill signal in some way could still leave stray work behind — the
  guarantee is "the step's own subprocess is signaled," not "everything
  it ever touched is cleaned up."
- No retries.
- No remote/marketplace actions or Docker steps — by design.
- No secrets management beyond `Deno.env`.
- No `always()` / `failure()` expression functions (GitHub Actions uses
  these to run cleanup steps/jobs even after a failure). `@actions/expressions`
  itself doesn't ship these as well-known functions, so supporting them
  would mean layering custom functions on top — left for a future pass.

## Tests

```
deno test -A source/core/workflow/
```

`examples/*.yml` are exercised end-to-end by `integration.test.ts`:
`hello-world.yml` (single job), `fan-out-fan-in.yml` (DAG concurrency),
`failing-step.yml` (continue-on-error + downstream `if:` semantics),
`matrix-fan-in.yml` (matrix expansion, array-shaped `needs.*`, both the
expression-indexing and `script:`-loop access patterns), and
`matrix-partial-failure.yml` (one instance failing among several). A
further test artificially delays an early matrix instance past a later
one and asserts the resulting arrays still land in generation order, not
finish order — the core regression proving the indexing is genuinely
timing-independent, not just usually stable.

Fail-fast/max-parallel are covered by tests that prove real subprocess
behavior, not just result bookkeeping: one asserts a killed instance's
whole run finishes in well under the time it would've taken to run to
completion unkilled (proving genuine preemption, not merely "not
started"); one uses `max-parallel: 1` to make "never started" fully
deterministic rather than a race; one computes true peak concurrency from
recorded start/end timestamps (an invariant check, not a wall-clock
assumption) to confirm `max-parallel` actually caps overlap.
