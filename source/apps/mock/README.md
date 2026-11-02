# Mock

A small project mixing languages, for testing how `ens` copes with them: a Rust
CLI, a Deno API and a Tauri desktop app whose shell embeds a web app, over a
Rust core crate, a Deno core package and a publishable Rust lib. Its `crates`
and `local` lib kits publish nothing, so nothing reaches a registry.

It's its own Ensemble project, not an app of this repository's: the root
`deno.json` leaves it out of the workspace, and nothing in
`.ensemble/config.yaml` builds it. Run its scenarios from the repository's root:

```sh
deno run -A --no-config source/apps/mock/exercise.ts --sandbox <scratch-dir> [--only <scenario,...>]
```

Each scenario runs the working tree's `ens` against a fresh copy of the mock, in
its own git repository with a local `origin`, under `<scratch-dir>`. Its full
output is saved next to that copy. A scenario reports what a user should be able
to do: a `GAP` is something `ens` can't do yet, not a broken test.

Tauri's first build takes several minutes; later ones reuse
`source/artifacts/.mock-cargo-target/`. It needs Rust, WebKitGTK and GTK
installed.
