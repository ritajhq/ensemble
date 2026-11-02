# Mock

An ordinary app of this repository that mixes languages, for testing how `ens`
copes with them: a Rust CLI (`cli`), a Deno API (`api`) and a Tauri desktop app
whose shell embeds a web app (`desktop/shell`, `desktop/web`), with shared code
in each language (`ledger`, `rounding`, `ink`). Its build entries are in
`.ensemble/config.yaml`, and its ships are in `source/ship/mock`:

```sh
ens build mock/cli
ens pack mock/desktop tauri
```

`exercise.ts` runs what a user should be able to do in a project like this:

```sh
deno run -A --no-config source/apps/mock/exercise.ts --sandbox source/artifacts/.mock-sandbox [--only <scenario,...>]
```

Each scenario runs the working tree's `ens` in a throwaway project: a slice of
this repository with only the mock for an app, its own git repository and a
local `origin`, plus libraries for a release to move and lib kits that publish
nothing. A scenario that passes leaves only its `output.log`. A `GAP` is
something `ens` can't do yet, not a broken test.

Sandboxes are large, so keep them on a real disk rather than a small `/tmp`.
Tauri's first build takes several minutes; later ones reuse
`source/artifacts/.mock-cargo-target/`. It needs Rust, WebKitGTK and GTK
installed.
