# `ens pack`

Pack a ship using the given pack kit.

```sh
ens pack <ship> <kit>
```

- `<ship>` — the ship to pack, under `source/ship/` (e.g. `web`, or
  `my_app/server` for a nested ship).
- `<kit>` — the pack kit to use (e.g. `docker`, `deno.compile`).
- `-m, --mode <mode>` — pack mode, declared by the kit's own `kit.yml`. Defaults
  to its first declared mode.
- `-o, --output-name <name>` — name for the packed output (e.g. an image tag or
  archive name). Defaults to the ship name.
- `-w, --watch` — repack on source changes. Only supported by kits that declare
  watch support (e.g. `deno.compile`).
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

## `deno.compile` and its lockfile

`deno compile` embeds every npm package the workspace's lockfile holds, whether
the program imports it or not, so compiling inside a repo whose apps and kits
use heavy dependencies (a bundler, a runtime for a cloud's workers) would ship
all of them. The `deno.compile` kit instead compiles in a workspace of its own:
the root `deno.json`, with only the members the program's module graph reaches,
under `.ensemble/cache/deno.compile/<ship>/` (gitignored).

That workspace has its own lockfile, `source/ship/<ship>/deno.lock`. Commit it:
it pins and checks exactly what the binary contains. The kit creates it on the
first pack and rewrites it when a dependency changes. `ens` itself is 125 MB
this way, against 594 MB compiled from the whole workspace.
