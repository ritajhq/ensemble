# Ensemble

A complete suite of tools that takes you from source code to deployment, in one
CLI.

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

