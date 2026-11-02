# Mocks

Small projects in languages other than Deno's, for testing how `ens` copes with
them. Run from the repository root:

```sh
deno run -A --no-config mocks/exercise.ts --sandbox <scratch-dir> [--only <scenario,...>]
```

Each scenario runs the working tree's `ens` against a fresh copy of a mock, in
its own git repository with a local `origin`, under `<scratch-dir>`. Its full
output is saved next to that copy. A scenario reports what a user should be able
to do: a `GAP` is something `ens` can't do yet, not a broken test.

- `tally/`: a Cargo workspace with a CLI, a Tauri desktop app, a core crate and
  a publishable lib, plus the kits that build, pack and publish them. The
  `crates` lib kit packages into a local directory, so nothing reaches
  crates.io. Its Cargo files live under `source/`, so the project's root holds
  nothing specific to Rust.

- `quill/`: a Deno workspace declaring no ecosystems, to show projects like it
  keep working. Its `local` lib kit only stamps, so nothing is published.

- `atlas/`: a Rust crate and a Deno package in each of core and apps, declaring
  both ecosystems, to show one project can mix languages.

Tauri's first build takes several minutes; later ones reuse
`mocks/.cargo-target/`. It needs Rust, WebKitGTK and GTK installed.
