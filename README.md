<p align="center">
  <img src="docs/ensemble-logo.png" alt="Ensemble logo" width="80" />
</p>

<h1 align="center">Ensemble</h1>

A complete suite of tools that takes you from source code to deployment, in one
CLI.

## Features

- **Pluggable build kits** — build any app type (a plain Deno/TS service, a
  React SPA, etc.) through a common, self-contained kit contract instead of
  bespoke per-project scripts.

- **Pluggable packaging** — turn a built app into a deployable artifact: Docker
  images (or OCI tarballs), or a self-contained compiled binary.

- **YAML workflow orchestration** — define jobs as a DAG with dependencies,
  conditionals, and matrix strategies, and run them locally or trigger them on a
  remote Ensemble server.

- **Environment-aware runs** — the same build, pack, and workflow definitions
  behave differently per deploy context via variables, without code changes.

- **One-command semver releases** — compute, create, or undo version tags with
  dry-run previews instead of tagging by hand.

- **Pure Deno, no Node/npm** — building, bundling, and compiling to a single
  executable all run on Deno's own tooling; `ens` itself installs as one native
  binary.

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
  kit builds or packages it. (This is another low hanging fruit for future improvements: kits can be published, configurable and used for scaffolding new apps).

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
