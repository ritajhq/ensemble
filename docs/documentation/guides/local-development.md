# Local development

Bringing a workload up on your machine goes through the same
source → build → pack → deploy flow as a real deployment, pointed at a
local target (usually the `compose` deploy kit). This walks through that
loop using this repo's own `website` workload
(`ci/website/delivery.yml`) as a concrete example — see
[Delivery manifests](../concepts/delivery-manifests.md) for what's in a
manifest and why.

## The fast path: `ens develop`

For most day-to-day work, one command is enough:

```sh
ens develop website
```

`ens develop <name>` is sugar for `ens deploy <name> compose --artifacts
local --emulate-externals --watch`: it builds and packs every app the
workload's `release:` section references, brings the workload up, creates
any `external` resource it knows how to emulate locally (e.g. a shared
Docker network like `ci/website/delivery.yml`'s `edge` network) instead of
requiring it to already exist, and keeps watching for source changes. Stop
it with Ctrl+C. Pass `-k, --kit <kit>` to target a different deploy kit
(defaults to `compose`).

To change an app while the stack runs, just edit its source — the manifest's
`development.sync` rules (see the example above) tell the kit which app
paths to sync into which container paths, and whether a sync also needs a
restart (`sync+restart` vs plain `sync`) for the process to pick the change
up.

## Doing it by hand

`ens develop` is pure sugar — nothing branches on "am I in develop mode."
The same result, one step at a time:

**1. Build every app the workload needs**, output lands in
`source/artifacts/<app>`:

```sh
ens build website/server -m development
ens build website/content -m development
```

**2. Pack each into a local image.** The `compose` kit resolves a compute's
`${release.<ship>}` reference to the locally-packed `<ship>:latest` and
refuses to start if it isn't in your image store:

```sh
ens pack website docker
```

**3. Deploy against local artifacts, watching:**

```sh
ens deploy website compose --artifacts local --emulate-externals --watch
```

`--artifacts local` resolves `${release.*}` references to what you just
packed rather than a published version; `--emulate-externals` stands up a
local substitute for each `external` entry the kit can emulate;
`--watch` runs the kit's long-lived watch command instead of a one-shot
apply. See the [`ens deploy` reference](../reference/cli/deploy.md) for
every flag, including `--eject`/`--plan` for inspecting what would happen
without applying it.

## Variables and secrets

A manifest's `variables` entries, and `secrets` entries with
`source: environment`, are read straight from `ens`'s own process
environment — which for a local run is whatever you've exported, and for a
real pipeline is whatever it loads before invoking `ens`. There is no
`ens`-managed `.env` convention: if a manifest declares one, export it
yourself before running `ens develop`/`ens deploy`, or have your shell's
own dotenv tooling do it. The `compose` kit wires a `source: environment`
secret as a native `${VAR}` compose env-var interpolation — a real
environment variable inside the container, not a mounted file — and is the
only source it supports today; `source: file` is declared in the schema
but not yet implemented by either built-in kit.

## Inspecting instead of guessing

- `ens status` lists every app, kit, library, and workload this project
  knows about — run it first if you don't already know the exact name a
  command expects.
- `ens deploy <name> <kit> explain <category.name>` explains one resource's
  resolution in detail: which provisioner matched, each value's
  provenance, and its resolved outputs.

## Next

- [Deploying](deploying.md) — the full termination model (`--eject`,
  `--plan`, `--watch`, apply) for non-local targets.
