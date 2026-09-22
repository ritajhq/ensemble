# `ens pack`

Pack a ship using the given pack kit.

```sh
ens pack <ship> <kit>
```

- `<ship>` — the ship to pack, under `source/ship/` (e.g. `web`, or
  `my_app/server` for a nested ship).
- `<kit>` — the pack kit to use (e.g. `docker`, `deno.compile`).
- `-m, --mode <mode>` — pack mode, declared by the kit's own `kit.yml`.
  Defaults to its first declared mode.
- `-o, --output-name <name>` — name for the packed output (e.g. an image
  tag or archive name). Defaults to the ship name.
- `-w, --watch` — repack on source changes. Only supported by kits that
  declare watch support (e.g. `deno.compile`).
- `--verbose` — show the kit's own build-tool output (e.g. `docker buildx
  build`'s progress log) instead of hiding it behind the pack spinner.
- `-v, --var <KEY=VALUE>` — override a pack var for this run only.
  Repeatable. Same resolution order as `build`, via
  `ens config set-pack-var`.

```sh
ens pack web docker -o my-web-image:latest
ens pack web docker -v TAG=v1.2.3 -v REGISTRY=ghcr.io/me
```
