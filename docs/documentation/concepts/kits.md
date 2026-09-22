# Kits

A kit is the pluggable piece that does the actual work behind `ens build`,
`ens pack`, and `ens deploy`. Nothing about "kit" is special-cased per kit
name in the engine — this is the seam that lets a new app type or a new
deployment target show up as a new kit directory, without ever touching
`ens`'s own command implementations.

There are three kit roles, each speaking a different contract:

## Build kits

A build kit is an executable that receives a fixed CLI contract —
`--source --name --out --mode <development|production> --workspace --vars
<json> [--watch]` — and must build from `source`, writing output to `out`.
An app states which build kit it uses via `ens config set-build-kit`; `ens
build <app>` runs it as a subprocess.

Built-in build kits: `deno.bundle` (a plain TypeScript service) and `react`
(a React SPA, with an `ssr` variant via `ens app create react <name>
--target ssr`).

## Pack kits

A pack kit is also a subprocess, invoked with a positional ship directory
plus `--name --output-name --artifacts --packages --mode --vars <json>
[--watch]`. It packages a built app into a deployable artifact — a Docker
image, an OCI tarball, a compiled binary. A pack kit declares its own
`modes` in a `kit.yml` manifest (mode name → kit-internal flags).

Built-in pack kits: `docker` and `deno.compile`.

## Deploy kits

Unlike build/pack kits, a deploy kit is loaded **in-process**: its `main.ts`
default-exports a configured `KitSdk.Deploy.Kit`. It receives the whole
resolved workload (not narrowed per-entry, since only the kit knows how its
target needs every entry assembled together), the dependency-ordered
batches, run options, and a `KitContext`. See
[Delivery manifests](delivery-manifests.md) for what it's handed, and
[Deploying](../guides/deploying.md) for how `ens deploy` drives it.

Built-in deploy kits: `compose` (Docker Compose — the fullest reference
implementation) and `aws` (CloudFormation — ECS task definitions, RDS
instances). Support is uneven by design: each kit documents its own drops
(e.g. `aws` silently drops `ports`/`networks`, but hard-fails on a
`storage.volume` entry rather than dropping it, since it has no provisioner
for storage yet). There is no `kubernetes` deploy kit in this repo.

## Authoring, installing, and sharing kits

Kits live under `.ensemble/kits/<role>/<name>` and are managed through the
`ens kit` command group — scaffolding a new one, installing one from a git
repository, pinning it to a ref, moving it to a newer version, or pushing a
locally-authored kit out to its own repository. See
[Authoring a kit](../guides/authoring-a-kit.md) for the full workflow and
[the CLI reference](../reference/cli/kit.md) for every subcommand.

## Next

- [Delivery manifests](delivery-manifests.md)
- [Authoring a kit](../guides/authoring-a-kit.md)
