# Managing libraries

A library is generic, cross-project-reusable code under `source/libs/<name>` —
distinct from `source/core`, which speaks your project's own domain (see
[Workspace layout](../concepts/workspace-layout.md)). The `ens lib` command
group manages a library's whole lifecycle, mirroring `ens kit` closely.

## Scaffold a new library

```sh
ens lib new my-utils                      # in the project's first ecosystem
ens lib new money --ecosystem cargo       # a Rust crate instead
```

Scaffolds `source/libs/<name>` as a package of one of the project's
[ecosystems](../concepts/kits.md#ecosystem-kits) — a Deno workspace member, a
Cargo crate — at version `0.0.1`, and makes it part of that ecosystem's
workspace. Without `--ecosystem`, it's the first one `ecosystems:` lists in
`.ensemble/config.yaml`.

It also registers the library under `publish.libs` there, named after its
folder:

```yaml
publish:
  libs:
    - name: my-utils # source/libs/my-utils
      package: my-utils # the name it publishes under
```

Nothing about publishing lives in the library's own folder. To make it
publishable, give the entry the kits it publishes through, and change `package`
to its full name in that registry:

```yaml
publish:
  libs:
    - name: my-utils
      package: "@acme/my-utils"
      publish:
        - kit: jsr
```

Other packages in the project use a library through their ecosystem's usual
workspace link — an import of its package name in Deno, a `path` dependency in
Cargo — never by reaching into its folder.

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

Pushes `source/libs/my-utils` to its own repository and registers this repo's
copy as a vendored checkout of it. Unlike `ens kit eject`, the remote is a
required `--remote` flag rather than a positional argument.

## Contributing a change back

```sh
ens lib contribute my-utils
```

Pushes a local change to a vendored library upstream and opens a pull request
against its remote.

## Publishing a library directly

```sh
ens lib publish my-utils jsr 1.4.0
```

Publishes `source/libs/my-utils` through one of the kits its `publish.libs`
entry declares (a `lib`-role kit under `.ensemble/kits/lib/<kit>` — `jsr` ships
with this repo, for Deno packages; there's no kit for crates.io yet, so a Rust
library can't be published this way), under the given version — independent of
`ens release`, for publishing a library on its own schedule rather than tying it
to a workload's release ceremony. Its ecosystem first moves it to that version
and repins whatever in the project depends on it. The kit first checks that this
machine may publish there (for `jsr`, a full-access `JSR_TOKEN` in
`.ensemble/release/secrets.env` whose account is a member of the package's
scope); without that, nothing is stamped or published. See
[Kits](../concepts/kits.md) for how a `lib`-role kit relates to
build/pack/deploy kits.

## Full reference

See the [`ens lib` CLI reference](../reference/cli/lib.md) for every
subcommand's exact arguments.
