# `ens pack`

Pack a ship using the given pack kit.

```sh
ens pack <ship> [kit]
```

- `<ship>` — the ship to pack, under `source/ship/` (e.g. `web`, or
  `my_app/server` for a nested ship).
- `[kit]` — the pack kit to use (e.g. `docker`, `deno.compile`). Defaults to the
  one `pack.<ship>.kit` names in `.ensemble/config.yaml`.
- `-m, --mode <mode>` — pack mode, declared by the kit's own `kit.yml`. Defaults
  to its first declared mode.
- `-o, --output-name <name>` — name for the packed output (e.g. an image tag or
  archive name). Defaults to the ship name.
- `-w, --watch` — repack on source changes. Only supported by kits that declare
  watch support (e.g. `deno.compile`).
- `--version <version>` — the version being released, for a kit whose artifact
  carries one. `ens release` passes its tag.
- `--verbose` — show the kit's own build-tool output (e.g.
  `docker buildx
  build`'s progress log) instead of hiding it behind the pack
  spinner.
- `-v, --var <KEY=VALUE>` — override a pack var for this run only. Repeatable.
  Same resolution order as `build`, via `ens config set-pack-var`.

```sh
ens pack web docker -o my-web-image:latest
ens pack web docker -v TAG=v1.2.3 -v REGISTRY=ghcr.io/me
```

## What a pack depends on

A pack depends on builds, never on other packs. Its kit says which builds,
through its `dependencies.ts`: the kit reads the ship's own config and answers
with the apps it uses (the `docker` kit from its Dockerfile's `COPY --from`, the
`deno.compile` kit from its `compile.yml`'s `source`, the `tauri` kit from its
`tauri.yml`'s `frontend`). `ens pack` builds those first, each once, and stops
at the first failure. A kit with no `dependencies.ts` has every app built first.

An earlier `needs:` key in `.ensemble/config.yaml` is gone; a config that still
has one is refused.

## The `tauri` kit

The Tauri app is made by the pack, not a build: a build is only a transformation
of source, and a Tauri executable is something to run or distribute as it is.
The ship holds a `tauri.yml`:

```yaml
shell: desktop # the app under source/apps with Cargo.toml and tauri.conf.json
frontend: web # the build whose output the app embeds (optional)
bundles: [deb] # installer mode only
```

It has two modes, each complete on its own:

- `binary` (`tauri build --no-bundle`): the executable alone, at
  `source/artifacts/packages/<name>`. With `--watch` it builds again, in debug,
  each time the crate's sources change, keeping the last good executable when a
  build fails. `-v profile=debug` asks for a debug build without watching.
- `installer` (`tauri build`): compiles and bundles in one pass; the bundles
  named in `bundles` are copied to `source/artifacts/packages/<name>/`.

## `deno.compile` and its lockfile

`deno compile` embeds every npm package the workspace's lockfile holds, whether
the program imports it or not, so compiling inside a repo whose apps and kits
use heavy dependencies (a bundler, a runtime for a cloud's workers) would ship
all of them. The `deno.compile` kit instead compiles in a workspace of its own:
the project's shared Deno settings, with only the members the program's module
graph reaches, under `.ensemble/cache/deno.compile/<ship>/` (gitignored).

That workspace has its own lockfile,
`.ensemble/ecosystems/deno/ships/<ship>/deno.lock`, or `deno.lock` beside the
ship in a project whose root holds its `deno.json`. Commit it: it pins and
checks exactly what the binary contains. The kit creates it on the first pack
and rewrites it when a dependency changes, but not when a release only moves a
project package's version. `ens` itself is 125 MB this way, against 594 MB
compiled from the whole workspace.
