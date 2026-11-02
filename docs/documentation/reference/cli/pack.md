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

## Needs

A build or a pack whose kit reads the output of another build or pack declares
it in `.ensemble/config.yaml`, whatever languages they're in:

```yaml
build:
  desktop/shell:
    kit: tauri
    needs:
      - desktop/web # another app's build output, also written `build: desktop/web`
      - pack: cli # a ship's pack output

pack:
  cli:
    kit: tarball
  downloads:
    kit: docker
    mode: image
    needs:
      - pack: desktop
      - build: website
```

`ens build` and `ens pack` finish what's needed first, deepest first and each
once, stop at the first failure, and refuse needs that go round in a circle. A
ship someone needs must name its kit under `pack:`, which also lets
`ens pack <ship>` leave the kit out and gives its default `mode` and
`outputName`. A release passes its version on to the packs a ship needs.

The kit is told where each output is, through `ctx.needs`:

```ts
const ctx = KitSdk.Pack.getContext(); // or KitSdk.Build.getContext()
for (const need of ctx.needs) {
  console.log(need.kind, need.name, need.output);
}
```

For a build, `output` is its folder under `source/artifacts/`. For a pack, it's
whatever that pack kit's `describe.ts` reports, which needn't be a path: the
`docker` kit reports an image's reference. A pack kit without a `describe.ts`
gives the `source/artifacts/packages/` folder.

A ship declaring `needs:` is built from them alone, unless its kit has a
`dependencies.ts` naming apps too. One declaring nothing, whose kit has no
`dependencies.ts`, has every app built first, as it always has.

## `deno.compile` and its lockfile

`deno compile` embeds every npm package the workspace's lockfile holds, whether
the program imports it or not, so compiling inside a repo whose apps and kits
use heavy dependencies (a bundler, a runtime for a cloud's workers) would ship
all of them. The `deno.compile` kit instead compiles in a workspace of its own:
the project's shared Deno settings, with only the members the program's module
graph reaches, under `.ensemble/cache/deno.compile/<ship>/` (gitignored).

That workspace has its own lockfile, `source/ship/<ship>/deno.lock`. Commit it:
it pins and checks exactly what the binary contains. The kit creates it on the
first pack and rewrites it when a dependency changes. `ens` itself is 125 MB
this way, against 594 MB compiled from the whole workspace.
