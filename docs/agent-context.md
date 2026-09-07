# Ensemble — orientation for an AI coding session

This file exists to onboard a fresh AI coding session (or a new human
contributor) into this repo fast. It's the codebase itself (this repo _is_
Ensemble — an `ens`-managed project building the `ens` CLI), plus the mental
model behind the tool. Read [README.md](../README.md) first if you haven't —
it's the user-facing pitch and command reference.

## The one-sentence model

Ensemble is a workspace layout + a CLI (`ens`) that takes a project from source
→ build → pack → publish → deploy, where "how" is always delegated to a
pluggable **kit** (build kits, pack kits, deploy kits) and "what to bring up" is
declared in a per-workload **delivery manifest**. The CLI itself never hardcodes
app-specific logic; it dictates the _contract_ kits and manifests must speak.

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
  kits/deploy/<kit>/  # deploy kit implementations (e.g. compose)
  config.yaml         # shared, git-tracked: app -> kit associations
  config.local.yaml   # gitignored, per-developer: personal var defaults
  bin/                # compiled `ens` binary lands here for this repo's own dogfooding
ci/<name>/
  delivery.yml         # the workload's delivery manifest (release + deploy)
```

`apps/<name>` and `ship/<name>` both support nesting — a multi-process app made
of several independently built/packed units lives as `apps/my_app/server` and
`apps/my_app/client` (mirrored under `ship/my_app/server`, `ship/my_app/client` if
both get packed). `<name>` throughout this doc and the CLI (`ens build <app>`,
`ens config set-build-kit <app> <kit>`, ...) means that full path relative to
`apps/`, not just the top-level folder.

### `source/core` — ens's own internals

- `core/core/` — CLI command implementations (`build.ts`, `pack.ts`,
  `publish.ts`, `deploy.ts`, `release.ts`, `config.ts`, `init.ts`, `app.ts`,
  `version.ts`, ...). Thin: mostly orchestration, arg validation, subprocessing
  build/pack kits and in-process-loading deploy kits.
- `core/kit-sdk/` — the helper library kits import to speak their contract. For
  build/pack that's parsing their own CLI invocation (`build-context.ts`,
  `pack-context.ts`, `scaffold-context.ts`); `deploy/` is a richer, in-process
  SDK (the deploy domain model — see the Deploy section below).

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
- **`ens publish <ship> <kit> <target>`** — publishes an already-packed ship to
  a `target` the pack kit supports (e.g. `docker push`, which retags to the
  configured registry and pushes).
- **`ens deploy <name> <kit>`** — parses `ci/<name>/delivery.yml`, builds the
  resolution batches, and hands the whole workload to the deploy kit
  (`.ensemble/kits/deploy/<kit>`, loaded in-process) to bring up. `ens develop
  <name>` is the same against a local dev stack (watch on, `external` entries
  auto-created).
- **`ens app create <kit> <name>`** — scaffolds `source/apps/<name>` from a
  build kit's hello-world template.
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
`.ensemble/kits/build/{deno.bundle,react}`,
`.ensemble/kits/pack/{docker,deno.compile}`.

## Deploy: the delivery model

A delivery manifest (`ci/<name>/delivery.yml`) is a YAML file with two
top-level sections — `release` and `deploy`. The deploy domain model lives in
[source/core/kit-sdk/deploy](../source/core/kit-sdk/deploy) (heavily commented —
read it directly for edge cases), parsed by `parse.ts` into a `Workload`.

- **`release`** — one entry per ship (`kit`, `mode`, optional `publish:`),
  describing how the ship packs and (optionally) publishes. A compute references
  its image as `${release.<ship>.image}`, resolved to the packed local tag; the
  registry lives on the `publish:` side, never in the local tag.
- **`deploy`** — the workload's resources, grouped into **categories**:
  `compute`, `storage`, `databases`, `messaging`, `networking`, `secrets`,
  `variables`, `external`. Each category holds named entries; a category that
  has more than one shape uses a `type:` discriminant (its **kind** — e.g.
  `databases` entries are `relational`/`key-value`/`document`/`cache`,
  `networking` is `load-balancer`/`dns`/`cdn`/`gateway`), while single-kind
  categories (`variables`, `secrets`) need no `type` — the group defines it.

### References and batches

Entries wire to each other by **reference**: `${category.name.output}` (e.g.
`${databases.database.host}`, `${storage.s3.url}`, `${compute.auth.http}`).
`graph.ts` validates every reference and topologically groups entries into
dependency-ordered **batches** (`buildBatches`) so the kit can bring them up in
the right order without re-deriving it. `variables` (value from the deploy's
process env, referenced as `${variables.<name>.value}`) and `secrets` (same, but
delivered as a mounted file / `_FILE` convention when `source: environment`) make
per-environment values explicit: they're declared in the manifest but supplied by
the surrounding pipeline. Environment selection is not an `ens` concept —
`--mode` is a dev-loop-vs-not toggle, not an environment.

### The deploy kit contract

Unlike build/pack kits (subprocesses speaking a CLI contract), a deploy kit is
loaded **in-process**: its `main.ts` default-exports a configured
`KitSdk.Deploy.Kit` (see [kit.ts](../source/core/kit-sdk/deploy/kit.ts)),
`Configure`d with `up`/`down` procedures. Each procedure receives the *whole*
resolved `Workload` (not narrowed per-entry — only the kit knows how its target
needs every entry assembled together, e.g. one compose.yaml with correct
`depends_on`), the `batches`, run `options` (`watch`/`version`/`development`),
and a `KitContext` (`name` — the deployment name, used e.g. as the compose
project name; `volumePath`; `artifactsPath`). The `instanceof
KitSdk.Deploy.Kit` check means a kit's `@ensemble/kit-sdk` must resolve to the
same module the `ens` binary embeds — for a vendored kit, point it at the
vendored source. The reference implementation is
[.ensemble/kits/deploy/compose](../.ensemble/kits/deploy/compose).

## Commit scope conventions

This repo follows [Conventional Commits](https://www.conventionalcommits.org)
(`type(scope): summary`), with a repo-specific rule for how `scope` maps to the
workspace layout above:

- **`source/apps/<name>`** — scope is `<name>`, the path under `apps/` (nesting
  included): `fix(web): ...`, `fix(my_app/server): ...`.
- **`source/core`, `source/libs`** — scope is `core/<name>` or `libs/<name>`,
  naming the subfolder touched: `fix(core/deploy): ...`,
  `feat(libs/event): ...`.
- **`source/ship/<name>`** — same `<name>` as the matching app, but always
  prefixed with `ship/`, even when that makes a 3-level scope:
  `fix(ship/web): ...`, `fix(ship/my_app/server): ...`.
- **`ci/<name>`** — the workload name for a change to its delivery manifest:
  `feat(portal): ...`, `fix(website): ...`.
- **`docs/`, `README.md`** — type is always `docs`, scope names what's
  documented: `docs(agent-context): ...`, `docs(readme): ...`.

Everything else (`.ensemble/`, root config, CI, etc.) follows plain Conventional
Commits with whatever scope best names the area touched — see `git log` for
precedent (e.g. `chore(changelog): ...`, `fix(release): ...`, `fix(kits): ...`).
Per this user's global git preferences, commit messages are a single summary
line — no body, no trailers.
