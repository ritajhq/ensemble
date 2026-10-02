# `ens lib`

Manage libraries under `source/libs/`. See
[Managing libraries](../../guides/managing-libraries.md) for the workflow
this command group supports end-to-end.

## `ens lib new <name>`

Scaffold a new library at `source/libs/<name>`.

```sh
ens lib new my-utils
```

## `ens lib install <url>`

Clone a library from a git repository and install it into
`source/libs/<name>`.

```sh
ens lib install https://github.com/org/their-lib
ens lib install https://github.com/org/their-lib@v2.0.0   # pinned to a ref
```

## `ens lib eject <name> --remote <url>`

Push `source/libs/<name>` to its own repository and register it as a
vendored checkout. Unlike `ens kit eject`, the remote is a required
`--remote` flag rather than a positional argument.

```sh
ens lib eject my-utils --remote git@github.com:org/my-utils.git
```

## `ens lib pin <name> <ref>`

Move a vendored library's checkout to a different ref.

```sh
ens lib pin my-utils v2.1.0
```

## `ens lib update <name> [bump]`

Move a vendored library to its next patch/minor/major tag. `<bump>` is one
of `patch`, `minor`, `major` — defaults to `patch`.

```sh
ens lib update my-utils
ens lib update my-utils major
```

## `ens lib contribute <name>`

Push a vendored library's local change upstream and open a pull request
against its remote.

```sh
ens lib contribute my-utils
```

## `ens lib publish <name> <kit> <version>`

Publish `source/libs/<name>` through one of its declared kits, outside
`ens release`.

```sh
ens lib publish my-utils jsr 1.4.0
```

`<kit>` is a `lib`-role kit under `.ensemble/kits/lib/<kit>` (e.g. `jsr`,
which ships with this repo).

## `ens lib uninstall`

Remove a vendored library — the inverse of `ens lib install`: its checkout,
its `.ensemble/vendor.lock.yml` entry, and its `.gitignore` line. Aliases:
`ens lib remove`, `ens lib rm`.

```sh
ens lib uninstall <name>
ens lib rm <name> --force
```

Only vendored librarys can be uninstalled: one authored in this project was
never installed, and deleting it is deleting your own code. Without
`-f, --force`, it refuses while
`publish.libs` in `.ensemble/config.yaml` still declares the library,
or while the checkout holds changes its remote doesn't have (uncommitted, or
commits on no remote branch or tag) — `ens lib contribute` them first.
