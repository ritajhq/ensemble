# Ensemble

A complete suite of tools that takes you from source code to deployment, in one
CLI.

## Get started

```sh
# Scaffold a new project
ens init my-app
```

## CLI features

- `ens init` — Scaffold a new Ensemble project.
- `ens build` — Build an app using its configured kit.
- `ens pack` — Pack a ship using the given packaging kit.
- `ens workflow <name>` — Run a workflow from the `workflows/` folder, or trigger
  it on a remote server with `--remote`. Manage remote profiles and upload
  workflows with `workflow remote configure`/`upload`.
- `ens config` — Manage `.ensemble/config.yaml`, e.g. associating an app with a
  build kit.
- `ens release` — Create or undo a semver release tag.

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

