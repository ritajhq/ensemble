# `ens exec` and `ens sync`

A language's workspace files live in `.ensemble/ecosystems/<name>`, where its
own tools don't look by themselves. `ens exec` runs them pointed at those files.

```sh
ens exec <tool> [args...]
ens exec deno test source/core
ens exec cargo test -p my-crate
```

Everything after `<tool>` goes to the tool unchanged. Generated files are
brought up to date first. A tool no ecosystem in the project claims runs as
given.

`ens exec cargo` runs from `.ensemble/ecosystems/cargo`, so paths in its
arguments are relative to there. `ens exec deno` runs where you are.

## `ens sync`

```sh
ens sync
```

Brings every ecosystem's generated files in line with the packages on disk.
`ens build`, `ens pack`, `ens app create`, `ens lib new` and `ens release` do
this themselves, so you only need it after changing a manifest by hand, before
using a language's tool or editor directly. Commit what it changes.
