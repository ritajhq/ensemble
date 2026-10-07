# `ens version`

Show or change the installed `ens` version.

```sh
ens version
```

With no subcommand, prints the installed version (or "unknown" if no
install marker is found).

## `ens version update [patch|minor|major]`

Install the newest release within a bump's scope from the installed
version. With no bump, install the latest release, whatever bump that takes
— or report that it's already installed.

```sh
ens version update
ens version update patch
ens version update minor
```

Both stay on the installed version's channel: a pre-release (`1.2.0-alpha.3`)
only updates to releases with that same pre-release tag, a normal version
only to normal releases.

## `ens version set <version>`

Install a specific released version, if it exists.

```sh
ens version set 1.4.0
```
