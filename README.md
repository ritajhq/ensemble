<p align="center">
  <img src="docs/ensemble-logo.png" alt="Ensemble logo" width="80" />
</p>

<h1 align="center">Ensemble</h1>

Ensemble is best defined as a protocol: It sets the stage and the contracts for
anything that acts on your source code. Instead of polluting your source with
scripts, bundlers and other tooling details, Ensemble lets you keep a tidy and
organized workspace, then orchestrates pluggable kits to build, package, and
deploy through a single CLI.

## What is it

One opinionated workspace layout that a single CLI take advantage of, to allow
focusing on each concern in isolation, yet it clears the path for a smooth
end-to-end flow from source to deployment.

### A workspace that scales by staying legible

The folder structure speaks to you, either in the onboard phase or day-to-day
work, the structure creates familiarity and lets you move with confidence. Every
app is self-contained, every concern (source, packaging, build output) has its
own top-level home.

See [Principles](#principles) below for the full shape.

### Build and package through a common contract

Any app type — a plain TS service, a React SPA, whatever comes next — builds
through a pluggable **build kit**, and any built app packages into a deployable
artifact (a Docker image, an OCI tarball, a compiled binary) through a pluggable
**pack kit**.

An app folder states which kit it uses, never how that kit does its job, so
adding a new app type never means inventing a new one-off script.

### Deploy from a declarative manifest

Describe a workload — its computes, databases, storage, networking, secrets and
variables — as a single delivery manifest, and a pluggable **deploy kit** brings
it up (or reconciles it to that declared state). Entries reference each other by
output (`${databases.database.host}`, `${release.web.image}`), so the kit works
out the dependency order; the same manifest runs against a local dev stack or a
real target without forking into per-environment code paths.

### Release without hand-tagging

Compute, create, or undo semver release tags in one command, with dry-run
previews instead of eyeballing git history before you tag.

### Powered by Deno

Ensemble is built on Deno rather than Node/npm because Deno makes sounder, more
coherent calls on the parts of JS tooling that are usually a mess — dependency
resolution, bundling, compiling to a single binary. That's an implementation
choice though: `ens` itself installs as one native binary, and you're not meant
to think about Deno day-to-day any more than you'd think about the compiler
behind any other tool you trust.

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
  apps). A similar contract exists for deploy kits, which take a declarative
  manifest and bring it up on a target (e.g., docker compose, K8s, a cloud
  provider).

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
`source/` and `.ensemble/` folders described above, fetches the built-in kits,
and initializes a git repository.

### `ens app create <kit> <name>`

Scaffolds a new app under `source/apps/<name>` from a build kit's hello-world
template, ready to `ens build`.

```sh
ens app create react web
ens app create deno.bundle api
```

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

### `ens publish <ship> <kit> <target>`

Publishes a previously packed ship to a `target` supported by its pack kit (e.g.
`push` for the `docker` kit, which retags the local image to its configured
registry and pushes it).

```sh
ens publish web docker push
ens publish web docker push --version 1.2.3
```

- `-o, --output-name <name>` — name of the local packed artifact to publish;
  defaults to the ship name.
- `--version <version>` — version to publish this artifact under, alongside its
  `:latest` tag; defaults to `latest`.
- `-v, --var <KEY=VALUE>` — override a publish var for this run only,
  repeatable.

### `ens deploy <name> <kit>`

Brings up (or reconciles to its declared state) the workload described by the
delivery manifest at `ci/<name>/delivery.yml`, using the given deploy kit
(`.ensemble/kits/deploy/<kit>`). Tearing a workload down lives behind
`ens destroy`.

```sh
ens deploy portal compose
ens deploy portal compose --version 1.2.3
```

- `-m, --mode <development|production>` — deploy mode, defaults to `production`.
  This is a dev-loop-vs-not toggle, not an environment: environment selection is
  the surrounding pipeline's job (it loads the right values into process env
  before `ens deploy`).
- `--version <version>` — released version to resolve `${release.<name>.image}`
  references to; defaults to `latest`.

### `ens develop <name>`

Deploys the same manifest locally for development: always watches for source
changes, and treats `external` resources as auto-creatable local conveniences
instead of requiring them to already exist.

```sh
ens develop portal
```

- `-k, --kit <kit>` — deploy kit to use, defaults to `compose`.

### `ens config`

Manages two files: `.ensemble/config.yaml` (shared, git-tracked) and
`.ensemble/config.local.yaml` (gitignored, per-developer).

```sh
ens config set-build-kit web react
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

## Local development

Bringing a whole workload up on your machine is the same source → build → pack →
deploy flow as a real deployment, pointed at a local target (the `compose` deploy
kit). The steps below assume a project whose delivery manifest lives at
`ci/<name>/delivery.yml` — `portal` is used as the concrete example.

**1. Build every app.** `ens develop` runs the *packed images*, so each app has
to be built first (output lands in `source/artifacts/<app>`):

```sh
for app in auth/server auth/client dashboard/api dashboard/web; do
  ens build "$app" -m development
done
```

**2. Pack each ship to a local image.** The compose kit resolves a compute's
`${release.<ship>.image}` to the locally-packed `<ship>:latest` and refuses to
start if it isn't in your image store, so pack them up front (including any base
image a ship's Dockerfile builds `FROM`):

```sh
for ship in auth/server auth/client dashboard/api dashboard/web; do
  ens pack "$ship" docker
done
```

**3. Supply the manifest's variables and secrets.** A manifest declares the
per-environment values it needs as `variables` and `secrets`; `ens deploy` reads
them from its own process env (it selects no environment itself — that's the
pipeline's job, and locally it's you). Export them before bringing the stack up:

```sh
export PGUSER=portal PGDATABASE=portal PGPASSWORD=devpassword
# ...every variable/secret the manifest declares
```

**4. Bring the stack up in dev mode.** `ens develop` watches for source changes
and auto-creates `external` resources (like a shared `edge` network) instead of
requiring them to already exist:

```sh
ens develop <name>          # e.g. ens develop portal
```

That renders a `compose.yaml`, brings up every compute plus the databases,
storage and gateway the manifest declares, and keeps watching. You reach the
services through the gateway's hosts (e.g. `https://<name>.localhost:8443`, with
a self-signed cert under `tls: internal`).

**5. Run any one-off provisioning.** Some setup can't be declared in the
manifest yet — provisioning an object-storage bucket, running an app's own schema
migration. These live as scripts under `ci/scripts/` and run once after the stack
is up (portal's, for example):

```sh
sh ci/scripts/garage-bootstrap.sh   # mint S3 credentials, feed them back as vars
sh ci/scripts/auth-migrate.sh       # create the auth schema's tables
```

> **Note.** A large database seed loaded through `docker-entrypoint-initdb.d`
> keeps Postgres on a local-only socket until it finishes, so a migration run too
> early gets `connection refused` — wait for the DB log to go quiet first. A seed
> written as bulk `COPY` rather than one-`INSERT`-per-row loads in seconds
> instead of minutes.

To change an app while the stack runs, just edit its source — `ens develop`
rebuilds and syncs it into the running container. To tear everything down, stop
`ens develop`; removing the containers/volumes lives behind `ens destroy`.
