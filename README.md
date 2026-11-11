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
output (`${databases.database.host}`, `${release.web}`), so the kit works out
the dependency order; the same manifest runs against a local dev stack or a real
target without forking into per-environment code paths.

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

This installs `ens` to `~/.ensemble/bin`; `ens version update` keeps it current.
See [Installation](docs/documentation/getting-started/installation.md) for
pinning a version.

## Quickstart

```sh
ens init my-project && cd my-project   # scaffold the layout and fetch the built-in kits
ens app create react web               # scaffold source/apps/web from the react kit
ens build web                          # build it into source/artifacts/web
ens develop web                        # build, pack and run ci/web/delivery.yml locally, watching
```

`ens develop` needs a delivery manifest — the
[quickstart](docs/documentation/getting-started/quickstart.md) and
[local development](docs/documentation/guides/local-development.md) guides walk
through writing one.

## Documentation

Everything lives under [docs/documentation](docs/documentation), which is also
what the website publishes:

| Section                                               | Read it for                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Getting started](docs/documentation/getting-started) | [Installation](docs/documentation/getting-started/installation.md), [Quickstart](docs/documentation/getting-started/quickstart.md)                                                                                                                                                                                                                                                                                       |
| [Concepts](docs/documentation/concepts)               | [Workspace layout](docs/documentation/concepts/workspace-layout.md), [Kits](docs/documentation/concepts/kits.md), [Delivery manifests](docs/documentation/concepts/delivery-manifests.md), [Launching](docs/documentation/concepts/launching.md), [Editor support](docs/documentation/concepts/editor-support.md)                                                                                                        |
| [Guides](docs/documentation/guides)                   | [Local development](docs/documentation/guides/local-development.md), [Deploying](docs/documentation/guides/deploying.md), [Authoring a kit](docs/documentation/guides/authoring-a-kit.md), [Managing libraries](docs/documentation/guides/managing-libraries.md), [Writing an ecosystem kit](docs/documentation/guides/writing-an-ecosystem-kit.md), [Using with agents](docs/documentation/guides/using-with-agents.md) |
| [Reference](docs/documentation/reference)             | [CLI](docs/documentation/reference/cli/index.md), [Delivery manifest schema](docs/documentation/reference/delivery-manifest-schema.md), [`.ensemble/config.yaml`](docs/documentation/reference/project-config.md)                                                                                                                                                                                                        |

## Working with an AI agent

`ens status` (or `ens status --json`) names every app, kit, library and workload
a command can take, and `ens mcp` exposes every command as an MCP tool. For
Claude Code, this repository carries an `ensemble` skill in
[.claude/skills/ensemble](.claude/skills/ensemble/SKILL.md) that teaches an
agent the workspace, the CLI and the conventions of an `ens` project.

## Contributing

This repository is itself an `ens` project that builds `ens`. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to run it from source, check a
change, and write a commit.
