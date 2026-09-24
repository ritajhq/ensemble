<p align="center">
  <img src="docs/branding/logo.png" alt="Ensemble logo" width="80" />
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

## Quickstart

The shortest path from nothing to a running app: scaffold a project, scaffold
an app, build it, and bring it up locally. If you haven't installed `ens` yet,
see [Installation](#installation).

### 1. Scaffold a project

```sh
ens init
```

Prompts for a project name, then lays down the `source/` and `.ensemble/`
folders, fetches the built-in kits, and initializes a git repository.

### 2. Scaffold an app

```sh
ens app create react web
```

Creates `source/apps/web` from the `react` build kit's hello-world template,
already configured to use that kit. Swap `react` for `deno.bundle` for a plain
TypeScript service instead.

### 3. Build it

```sh
ens build web -m development
```

Runs the app's configured build kit and writes output to `source/artifacts/web`.

### 4. Bring it up locally

A running deployment needs a workload manifest, not just a built app — see
[Local development](#local-development) for the full loop (pack → manifest →
`ens develop`). If your project already has one (e.g. `ci/web/delivery.yml`):

```sh
ens develop web
```

This builds, packs, and deploys the workload locally, watching for source
changes until you stop it.

Every command's full flag list lives in the
[CLI reference](docs/documentation/reference/cli/index.md).

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
pipeline's job, and locally it's you). For local runs, commit the known-good dev
values to `ci/<name>/variables.env` — `ens deploy`/`develop` loads that file
before the deploy kit runs, so `ens develop <name>` just works with nothing
exported:

```ini
# ci/portal/variables.env — keys are the manifest's variable/secret names
pguser=portal
pgdatabase=portal
pgpassword=devpassword
# ...every variable/secret the manifest declares
```

The file is a source of *defaults*: any value already exported in the
environment wins over it, so a real pipeline pulling per-environment values from
a secrets manager is never overridden by the committed dev file. (Keep genuine
secrets out of it — dev throwaways only.)

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

**5. Run any one-off provisioning.** Work that can only happen *after* the stack
is up — an app's own schema migration, trusting the gateway's local CA — is
declared under `tasks` in the manifest and invoked by hand (a task is never fired
by a deploy, so a failing one can't fail a deployment):

```sh
ens delivery task <name> <kit>                  # list what the workload declares
ens delivery task <name> <kit> auth-migrate     # e.g. portal's auth schema migration
```

A task's `arguments` reach its script as environment variables, resolved from the
same manifest values the deploy's own env blocks use, plus `${deployment.name}`,
`${deployment.artifact}` and `${deployment.root}` for the deployment's own
identity — which is what lets that script address the stack through
`docker compose -p "$project" -f "$artifact"` rather than hardcoding the
container, network, and artifact names compose derives from the deployment. See
[`tasks` in the manifest schema](docs/documentation/reference/delivery-manifest-schema.md#tasks).

> **Note.** A large database seed loaded through `docker-entrypoint-initdb.d`
> keeps Postgres on a local-only socket until it finishes, so a migration run too
> early gets `connection refused` — wait for the DB log to go quiet first. A seed
> written as bulk `COPY` rather than one-`INSERT`-per-row loads in seconds
> instead of minutes.

To change an app while the stack runs, just edit its source — `ens develop`
rebuilds and syncs it into the running container. To tear everything down, stop
`ens develop`; removing the containers/volumes lives behind `ens destroy`.
