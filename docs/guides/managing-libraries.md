# Managing libraries

A library is generic, cross-project-reusable code under `source/libs/<name>`
— distinct from `source/core`, which speaks your project's own domain (see
[Workspace layout](../concepts/workspace-layout.md)). The `ens lib` command
group manages a library's whole lifecycle, mirroring `ens kit` closely.

## Scaffold a new library

```sh
ens lib new my-utils
```

Scaffolds `source/libs/my-utils`.

## Install a library someone else published

```sh
ens lib install https://github.com/org/their-lib
ens lib install https://github.com/org/their-lib@v2.0.0
```

Vendors it into `source/libs/<name>`, same as `ens kit install`.

## Moving a vendored library

```sh
ens lib pin my-utils v2.1.0
ens lib update my-utils          # next patch (default)
ens lib update my-utils major
```

## Sharing a locally-authored library

```sh
ens lib eject my-utils --remote git@github.com:org/my-utils.git
```

Pushes `source/libs/my-utils` to its own repository and registers this
repo's copy as a vendored checkout of it. Unlike `ens kit eject`, the
remote is a required `--remote` flag rather than a positional argument.

## Contributing a change back

```sh
ens lib contribute my-utils
```

Pushes a local change to a vendored library upstream and opens a pull
request against its remote.

## Publishing a library directly

```sh
ens lib publish my-utils jsr 1.4.0
```

Publishes `source/libs/my-utils` through one of its declared publish kits
(a `lib`-role kit under `.ensemble/kits/lib/<kit>` — `jsr` ships with this
repo), under the given version — independent of `ens release`, for
publishing a library on its own schedule rather than tying it to a
workload's release ceremony. See [Kits](../concepts/kits.md) for how a
`lib`-role kit relates to build/pack/deploy kits.

## Full reference

See the [`ens lib` CLI reference](../reference/cli/lib.md) for every
subcommand's exact arguments.
