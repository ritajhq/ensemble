# @ensemble/workflow

A minimal CI-style pipeline/workflow runner: YAML workflow files, jobs, steps,
`needs`, `if:` conditions, `${{ }}` expressions, and outputs passed between
steps — in the spirit of GitHub Actions, but with no `uses:`, no actions
marketplace, and no Docker/runner-registration protocol. A step is just a
local TypeScript module with a `run()` function, or a raw shell command.

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
```

`--job <id>` runs only that job and its transitive dependencies. Script
paths inside a workflow (`script: ./steps/build.ts`) resolve relative to
that workflow's own folder.

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
    `cmd /c` on Windows), inheriting stdout/stderr.
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

## The `script:` module contract

```ts
// steps/build.ts
import type { StepContext } from "@ensemble/workflow";

export async function run(ctx: StepContext): Promise<Record<string, string>> {
  // ctx.env - the job's environment variables
  // ctx.needs - already-completed jobs' results/outputs (plain objects,
  //   array-shaped for a matrixed upstream — see "Matrix jobs")
  // ctx.matrix - this instance's own combination (only present in a
  //   matrixed job's own steps)
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

- `env.*` — environment variables passed into the run.
- `needs.<job>.result` / `needs.<job>.outputs.*` — already-completed jobs
  (array-shaped per-key if `<job>` is matrixed — see "Matrix jobs").
- `steps.<id>.outputs.*` — steps completed earlier in the *same* job (only
  steps with an explicit `id:` are addressable).
- `matrix.*` — the current instance's own combination, only present inside
  a matrixed job's own steps/`if:` (absent, and therefore an error to
  reference, everywhere else).

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
