# `ens version`

Show or change the installed `ens` version.

```sh
ens version
```

With no subcommand, prints the installed version (or "unknown" if no
install marker is found).

## `ens version update <patch|minor|major>`

Install the newest release within a bump's scope from the installed
version.

```sh
ens version update patch
ens version update minor
```

## `ens version set <version>`

Install a specific released version, if it exists.

```sh
ens version set 1.4.0
```
