# Installation

Linux (x64) only, for now.

```sh
curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh
```

This installs `ens` to `~/.ensemble/bin` and prints a `PATH` hint if it isn't
already on your `PATH`.

To install a specific version instead of the latest release:

```sh
curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh -s <version>
```

## Updating

`ens` updates itself in place, using the same release tags the install
script reads from:

```sh
ens version               # show the installed version
ens version update patch  # or minor / major — newest release within that bump
ens version set 1.4.0     # install a specific released version
```

## Next

Continue to the [quickstart](quickstart.md) to scaffold a project and run
your first build → pack → develop loop.
