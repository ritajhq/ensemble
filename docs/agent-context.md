# Ensemble — orientation for an AI coding session

This file exists to onboard a fresh AI coding session (or a new human
contributor) into this repo fast. It's the codebase itself (this repo _is_
Ensemble — an `ens`-managed project building the `ens` CLI), plus the mental
model behind the tool. Read [README.md](../README.md) first if you haven't —
it's the user-facing pitch and command reference.

## The one-sentence model

Ensemble is a workspace layout + a CLI (`ens`) that takes a project from source
→ build → pack → deploy, where "how" is always delegated to a pluggable **kit**
and "when/where" is always delegated to a declarative **workflow**. The CLI
itself never hardcodes app-specific logic; it dictates the _contract_ kits and
workflows must speak.

## Workspace layout (what lives where)

```
source/
  apps/<name>/       # app source, one folder per deployable unit
  core/               # ens's own implementation (see below)
  libs/               # generic, cross-project-reusable code
  artifacts/<name>/   # build output (gitignored), one folder per app
  ship/<name>/        # packaging inputs (Dockerfile, etc.) per pack target
.ensemble/
  kits/build/<kit>/   # build kit implementations
  kits/pack/<kit>/    # pack kit implementations
  config.yaml         # shared, git-tracked: app -> kit associations
  config.local.yaml   # gitignored, per-developer: personal var defaults
  schemas/            # JSON Schemas (e.g. workflow.schema.json) for editor validation
  bin/                # compiled `ens` binary lands here for this repo's own dogfooding
workflows/<name>/
  workflow.yml         # the DAG definition
  contexts/<name>/     # per-deploy-context files/secrets (see Context below)
```

`apps/<name>` and `ship/<name>` both support nesting — a multi-process app made
of several independently built/packed units lives as `apps/my_app/server` and
`apps/my_app/client` (mirrored under `ship/my_app/server`, `ship/my_app/client` if
both get packed). `<name>` throughout this doc and the CLI (`ens build <app>`,
`ens config set-build-kit <app> <kit>`, ...) means that full path relative to
`apps/`, not just the top-level folder.

### `source/core` — ens's own internals

- `core/core/` — CLI command implementations (`build.ts`, `pack.ts`,
  `workflow.ts`, `release.ts`, `config.ts`, `init.ts`, `version.ts`, ...). Thin:
  mostly orchestration, arg validation, calling into `core/workflow`.
- `core/workflow/` — the workflow engine: YAML parsing (`parse.ts`,
  `schema.ts`), DAG construction (`graph.ts`), execution (`run-workflow.ts`,
  `run-job.ts`, `run-step.ts`), matrix expansion (`matrix.ts`), the expression
  language (`expressions.ts`, `context.ts`), and context/secret loaders
  (`context-loaders/`).
- `core/kit-sdk/` — the small helper library kits import to parse their own CLI
  contract (`build-context.ts`, `pack-context.ts`, `scaffold-context.ts`). This
  is the actual "contract" a kit implements — see below.
- `core/platform/` — the remote server side: triggering workflows on a deployed
  Ensemble server, dashboard/status APIs, auth.

## The CLI surface

Full flag reference lives in [README.md](../README.md#usage) — don't duplicate
it here, just the mental model per command:

- **`ens build <app>`** — runs the app's configured build kit
  (`.ensemble/kits/build/<kit>`) as a subprocess with a fixed CLI contract
  (`--source --name --out --mode --workspace --vars [--watch]`), writing to
  `source/artifacts/<app>`. Which kit an app uses is set once via
  `ens config set-build-kit` and lives in `.ensemble/config.yaml`.
- **`ens pack <ship> <kit>`** — same idea for packaging: runs a pack kit
  (`.ensemble/kits/pack/<kit>`) against `source/ship/<ship>`, producing a
  deployable artifact (Docker image, OCI tarball, compiled binary). A pack kit
  declares its own `modes` in its `kit.yml`.
- **`ens workflow <name>`** — parses `workflows/<name>/workflow.yml`, builds a
  job DAG, and runs it (locally, or remotely via `-r <profile>` against a
  deployed Ensemble server).
- **`ens config`** — edits `.ensemble/config.yaml` (shared) and
  `.ensemble/config.local.yaml` (personal, gitignored) — kit associations and
  default build/pack vars.
- **`ens release` / `ens version`** — semver git-tag management, dry-run by
  default for anything destructive.

## Kits: the build/pack contract

A kit is just an executable that speaks a fixed CLI contract — nothing about
"kit" is special-cased per kit name in the engine. This is the Open/Closed seam:
adding a new app type means adding a new kit directory, never touching
`core/core/build.ts` or `pack.ts`.

- **Build kit contract** (parsed via `kit-sdk/build-context.ts`'s
  `getKitContext()`): receives
  `--source --name --out --mode
  <development|production> --workspace --vars <json> [--watch]`,
  must build from `source` and write output to `out`.
- **Pack kit contract** (parsed via `kit-sdk/pack-context.ts`'s
  `getPackKitContext()`): receives a positional ship dir,
  `--name
  --output-name --artifacts --packages --mode --vars <json> [--watch]`,
  plus a `kit.yml` manifest declaring its own `modes` map (see
  [.ensemble/kits/pack/docker/kit.yml](../.ensemble/kits/pack/docker/kit.yml)
  for the shape — mode name → kit-internal flags).

Existing kits to look at as reference implementations:
`.ensemble/kits/build/{deno.bundle,react.spa}`,
`.ensemble/kits/pack/{docker,deno.compile}`.

## Workflows: the orchestration model

A workflow ([schema.ts](../source/core/workflow/schema.ts) is the authoritative
reference — it's heavily commented, read it directly for edge cases) is a YAML
file with:

- **`jobs`** — a DAG via `needs:`. Each job has `steps:` (shell `run:` or
  `script:`, a Deno module), an optional `if:` condition, an optional `matrix:`
  (Cartesian-product fan-out over `axes`, with `fail-fast` and `max-parallel`),
  and an optional `in: { repository: <name> }` to run inside a checked-out
  resource instead of run scratch space.
- **`on`** — how this workflow can be triggered externally: `manual` (typed
  `inputs:` — string/number/boolean/object/git-tags/context/job) or `github`
  (tag-push patterns mapped to a deploy context).
- **`resources.repositories`** — repos to auto-clone before jobs run,
  addressable as `repositories.<name>.path`.
- **`context`** — the deploy-context contract: named `variables`/`files` and
  `secrets.variables`/`secrets.files` this workflow needs, resolved by name
  rather than by location (a loader decides _where_ each comes from — see
  `context-loaders/`). Every declared variable/secret becomes both an env var
  (`NAME` / `NAME_FILE`) and an expression path
  (`context.variables.<key>.{name,value,path}`). `--context <name>` itself is
  `${{ context.name }}`, the standard way to branch dev/stage/prod behavior (see
  `workflows/deploy/workflow.yml`'s `if: context.name == 'development'` jobs).

### Expression language (`${{ ... }}`)

GitHub-Actions-flavored expressions (same library family, same truthiness
rules), evaluated against a context object built per job/step. Key context
paths: `variables`, `needs.<job>.{result,outputs}` (matrix jobs index by
Cartesian-product order — `.matrix[i]`/`.results[i]`), `matrix.<axis>`,
`trigger.<input>`, `repositories.<name>.path`, `context.*` (above),
`steps.<id>.outputs.<name>` (job-local only). Two custom functions beyond stock
GitHub Actions syntax:

- `ensemble.artifacts("<name>")` → `source/artifacts/<name>`
- `ensemble.packages("<name>")` → `source/artifacts/packages/<name>`

both resolved relative to the calling step's cwd. See
[workflows/deploy/workflow.yml](../workflows/deploy/workflow.yml) for these in
real use (e.g. `${{ ensemble.packages('ensemble-linux-x64') }}`).

### This repo's own workflow, as a worked example

[workflows/deploy/workflow.yml](../workflows/deploy/workflow.yml) deploys `ens`
itself. It's worth reading end to end once — it demonstrates: a `manual` trigger
with a `git-tags`-typed input, `context`-gated dev-only jobs (hot-reload
watchers for cli/server/web builds, running as backgrounded subprocesses tracked
via PID files), a step outputting to `$WORKFLOW_OUTPUT` for a later step to
consume, and `docker compose` driven with an env file assembled from context +
step outputs.

## Commit scope conventions

This repo follows [Conventional Commits](https://www.conventionalcommits.org)
(`type(scope): summary`), with a repo-specific rule for how `scope` maps to the
workspace layout above:

- **`source/apps/<name>`** — scope is `<name>`, the path under `apps/` (nesting
  included): `fix(web): ...`, `fix(my_app/server): ...`.
- **`source/core`, `source/libs`** — scope is `core/<name>` or `libs/<name>`,
  naming the subfolder touched: `fix(core/workflow): ...`,
  `feat(libs/event): ...`.
- **`source/ship/<name>`** — same `<name>` as the matching app, but always
  prefixed with `ship/`, even when that makes a 3-level scope:
  `fix(ship/web): ...`, `fix(ship/my_app/server): ...`.
- **`workflows/<name>`** — just the workflow name, plus `/<context>` when the
  change is specific to one deploy context: `feat(deploy): ...`,
  `fix(deploy/production): ...`.
- **`docs/`, `README.md`** — type is always `docs`, scope names what's
  documented: `docs(agent-context): ...`, `docs(readme): ...`.

Everything else (`.ensemble/`, root config, CI, etc.) follows plain Conventional
Commits with whatever scope best names the area touched — see `git log` for
precedent (e.g. `chore(changelog): ...`, `fix(release): ...`, `fix(kits): ...`).
Per this user's global git preferences, commit messages are a single summary
line — no body, no trailers.
