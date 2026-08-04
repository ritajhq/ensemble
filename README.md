<p align="center">
  <img src="docs/ensemble-logo.png" alt="Ensemble logo" width="80" />
</p>

<h1 align="center">Ensemble</h1>

Most TypeScript projects trade tidiness for speed of change as they grow: the
longer one survives, the more its structure crystallizes and the slower it
gets to change. Ensemble is a bet that this is a tooling failure, not a law
of nature — that the right workspace layout and a single coherent CLI can
give you tidiness and speed at once, indefinitely, instead of forcing that
trade as the project grows.

## What is it

One opinionated workspace layout, one CLI, covering a TypeScript project from
source to deployment.

### A workspace that scales by staying legible

The folder structure speaks to you, either in the onboard phase or day-to-day
work, the structure creates familiarity and lets you move with confidence. Every
app is self-contained, every concern (source, packaging, build output) has its
own top-level home.

See [Principles](#principles) below for the full shape.

### Build and package through a common contract, not bespoke scripts

Any app type — a plain TS service, a React SPA, whatever comes next — builds
through a pluggable **build kit**, and any built app packages into a deployable
artifact (a Docker image, an OCI tarball, a compiled binary) through a pluggable
**pack kit**. An app folder states which kit it uses, never how that kit does
its job, so adding a new app type never means inventing a new one-off script.

### Orchestrate with YAML workflows, not glue scripts

Define jobs as a DAG — dependencies, conditionals, matrix strategies — and run
them locally or trigger them on a remote Ensemble server. The same
build/pack/workflow definitions behave differently per deploy context via
variables, so environments are configuration, not forked code paths.

### Release without hand-tagging

Compute, create, or undo semver release tags in one command, with dry-run
previews instead of eyeballing git history before you tag.

### Deno underneath, not as the point

Ensemble is built on Deno rather than Node/npm because Deno makes sounder, more
coherent calls on the parts of JS tooling that are usually a mess — dependency
resolution, bundling, compiling to a single binary. That's an implementation
choice, not the pitch: `ens` itself installs as one native binary, and you're
not meant to think about Deno day-to-day any more than you'd think about the
compiler behind any other tool you trust.

## Principles

Ensemble's main drive is a workspace that stays tidy as it grows: the folder
structure itself should help you think about one piece of the project at a time,
without the details of other concerns leaking in.

- **Each app is self-contained** — everything an app needs to build lives under
  its own `source/apps/<name>`. Potentially every package here is a separate
  deployable artifact, so it should be able to build and run independently of
  the others.

- **Concerns live in their own top-level folder** — source (`source/apps`), how
  it's packaged for deployment (`source/ship`) and build output
  (`source/artifacts`) are kept apart, this helps you focus on the layer you're
  working on without being distracted by the others (i.e. you develop a new
  feature in `source/apps` and then focus on how to package it in `source/ship`
  without having to wade through the other apps' build output).

- **Shared code is explicit and intentional** — cross-cutting logic lives in
  `source/core` and `source/libs` and is pulled in deliberately, instead of apps
  reaching into each other's folders. `core` is code that speaks/mentions your
  project business logic, while `libs` is code that is generic enough to be
  reused across multiple projects (a big feature in the future will be the
  ability to seamlessly integrate/publish improvements and managing different
  versions across different ensemble projects).

- **Kits carry the mess so app folders don't have to** — build and packaging
  logic lives in `.ensemble/kits`, behind a common contract. An app folder only
  ever states _which_ kit it uses, never the implementation detail of _how_ that
  kit builds or packages it. (This is another low hanging fruit for future
  improvements: kits can be published, configurable and used for scaffolding new
  apps).

## Installation

Linux (x64) only, for now:

```sh
curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh
```

This installs `ens` to `~/.ensemble/bin` and prints a PATH hint if it isn't
already on your `PATH`. To install a specific version instead of the latest
release:

```sh
curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh -s <version>
```

Once installed, update in place with:

```sh
ens version next patch   # or minor / major
ens version set <version>
```

## Usage

### `ens init`

Scaffolds a new Ensemble project: prompts for a project name and lays down the
`source/`, `.ensemble/`, and `workflows/` folders described above.

### `ens build <app>`

Builds an app through its configured kit (`.ensemble/kits/build/<kit>`, set via
`ens config set-build-kit`). Output goes to `source/artifacts/<app>`.

```sh
ens build web -m production
ens build web -w                          # rebuild on source changes
ens build web -v API_URL=https://staging.example.com -v DEBUG=true
```

- `-m, --mode <development|production>` — build mode, defaults to `development`.
- `-w, --watch` — rebuild on source changes instead of exiting after one build.
- `-v, --var <KEY=VALUE>` — override a build var for this run only, repeatable.
  Resolution order (highest wins): `-v` flags → `ens config set-build-var`
  defaults → `source/envs/build/<app>.env`.

### `ens pack <ship> <kit>`

Packs a built ship into a deployable artifact (a Docker image, an OCI tarball,
or a self-contained compiled binary) using the given pack kit
(`.ensemble/kits/pack/<kit>`).

```sh
ens pack web docker -o my-web-image:latest
ens pack web docker -v TAG=v1.2.3 -v REGISTRY=ghcr.io/me
```

- `-m, --mode <mode>` — pack mode, declared by the kit's `kit.yml`; defaults to
  its first declared mode.
- `-o, --output-name <name>` — name for the packed output (e.g. an image tag or
  archive name); defaults to the ship name.
- `-v, --var <KEY=VALUE>` — override a pack var for this run only, repeatable.
  Same resolution order as `build`, via `ens config set-pack-var` and
  `source/envs/pack/<ship>.env`.

### `ens workflow <name>`

Runs a YAML workflow from `workflows/<name>/workflow.yml` as a local DAG of
jobs, or triggers it on a remote Ensemble server. Full syntax (jobs, `needs`,
`if:`, matrix strategies, expression contexts) is documented in
[source/core/workflow](source/core/workflow).

```sh
ens workflow deploy
ens workflow deploy -j build              # only that job + dependencies
ens workflow deploy -c 2                  # cap concurrency
ens workflow deploy --context production
ens workflow deploy -v GREETING=hi -v API_URL=https://staging.example.com
ens workflow deploy -i sha=abc123 -i replicas=3
```

- `-j, --job <id>` — run only this job and its transitive dependencies.
- `-c, --concurrency <n>` — max number of jobs to run concurrently.
- `--context <name>` — deploy context to run with, exposed to jobs/steps as
  `context.name`/`context.path`.
- `-v, --var <KEY=VALUE>` — override a workflow variable, repeatable.
- `-i, --input <NAME=VALUE>` — set a manual trigger input (JSON-parsed when
  possible), repeatable.
- `-r, --remote <profile>` — trigger on a remote server instead of running
  locally (workflow must already be deployed there with a manual trigger).
  Blocks until the remote run finishes; logs aren't streamed back.

Remote profiles are managed separately, and the server side of this contract is
documented in [source/core/platform](source/core/platform):

```sh
ens workflow remote configure staging     # prompts for URL + bearer token
ens workflow remote upload deploy -r staging
```

### `ens config`

Manages two files: `.ensemble/config.yaml` (shared, git-tracked) and
`.ensemble/config.local.yaml` (gitignored, per-developer).

```sh
ens config set-build-kit web react.spa
ens config set-build-var web API_URL=http://localhost:4000
ens config set-pack-var web TAG=dev
```

- `set-build-kit <app> <kit>` — associates an app with a build kit in the shared
  `config.yaml`.
- `set-build-var <app> KEY=VALUE` — sets a personal default build var for an app
  in `config.local.yaml`, for things you build the same way every time locally.
  Repeated calls accumulate keys rather than overwrite them.
- `set-pack-var <ship> KEY=VALUE` — same, for pack vars.

### `ens release next|set|undo`

Computes, creates, or undoes a semver release tag from git tags, with dry-run
previews instead of tagging by hand.

```sh
ens release next patch --dry-run          # or minor / major
ens release next minor -p rc.1            # v1.3.0-rc.1
ens release set 2.0.0 -r upstream
ens release undo
```

- `--dry-run` — preview without making changes (global to all three).
- `-p, --pre-release <suffix>` — append a `-<suffix>` identifier (ignored by
  `undo`).
- `-m, --meta <suffix>` — append a `+<suffix>` build metadata identifier
  (ignored by `undo`).
- `-r, --remote <name>` — remote to push to/delete from when confirmed, defaults
  to `origin`.

Creating a tag prompts to push commits + tag to the remote; `undo` deletes the
last tag locally and prompts to also delete it from the remote.

### `ens version`

Shows the installed `ens` version, or updates it in place using the same release
tags/mechanism as the install script.

```sh
ens version
ens version update patch    # or minor / major
ens version set 1.4.0
```
