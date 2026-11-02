# Kits

A kit is the pluggable piece that does the actual work behind `ens build`,
`ens pack`, and `ens deploy`. Nothing about "kit" is special-cased per kit name
in the engine — this is the seam that lets a new app type or a new deployment
target show up as a new kit directory, without ever touching `ens`'s own command
implementations.

Every kit has a `kit.yml` naming its `role` and the `protocol` it speaks: the
version of the contract between `ens` and its kits. `ens` refuses a kit
declaring a protocol it doesn't speak, and `ens kit install`, `pin` and `eject`
also refuse one declaring none.

There are four kit roles, each speaking a different contract:

## Build kits

A build kit is an executable that receives a fixed CLI contract —
`--source --name --out --mode <development|production> --workspace --vars
<json> [--watch] [--target <t>] [--options <json>]`
— and must build from `source`, writing output to `out`. `--options` carries the
app's `build.<name>.options` from `.ensemble/config.yaml` untouched, for the kit
to interpret (e.g. `deno.bundle`'s `format` and `external`). An app states which
build kit it uses via `ens config set-build-kit`; `ens
build <app>` runs it as a
subprocess.

Built-in build kits: `deno.bundle` (a plain TypeScript service) and `react` (a
React SPA, with an `ssr` variant via
`ens app create react <name>
--target ssr`).

## Pack kits

A pack kit is also a subprocess, invoked with a positional ship directory plus
`--name --output-name --artifacts --packages --workspace --mode --vars <json>
[--version <v>] [--needs <json>] [--watch]`.
It packages a built app into a deployable artifact — a Docker image, an OCI
tarball, a compiled binary. A pack kit declares its own `modes` in a `kit.yml`
manifest (mode name → kit-internal flags).

A pack kit that can publish also ships a `publish.ts`, with the targets it
supports declared under `publish:` in its `kit.yml`, and an `authorize.ts`. The
`authorize.ts` gets the same arguments as `publish.ts` and only reads: it
answers whether this machine may publish to the target, and `ens` refuses the
publish when it says no or is missing. See
[Publish authorization](../reference/cli/release.md#publish-authorization).

Built-in pack kits: `docker` and `deno.compile`.

## Deploy kits

Unlike build/pack kits, a deploy kit isn't a CLI: its `main.ts` default-exports
a configured `KitSdk.Deploy.Kit`. `ens` never imports it in-process: it starts
one long-lived `deno run` child process for the kit (from the kit's directory,
so the kit resolves its own dependencies), which imports `main.ts` and answers
`ens`'s calls over RPC for as long as the command runs — the kit's module state
lasts that long too, then the process ends with `ens`. It receives the whole
resolved workload (not narrowed per-entry, since only the kit knows how its
target needs every entry assembled together), the dependency-ordered batches,
run options, and a `KitContext`. See [Delivery manifests](delivery-manifests.md)
for what it's handed, and [Deploying](../guides/deploying.md) for how
`ens deploy` drives it.

Built-in deploy kits: `compose` (Docker Compose — the fullest reference
implementation) and `aws` (CloudFormation — ECS task definitions, RDS
instances). Support is uneven by design: each kit documents its own drops (e.g.
`aws` silently drops `ports`/`networks`, but hard-fails on a `storage.volume`
entry rather than dropping it, since it has no provisioner for storage yet).
There is no `kubernetes` deploy kit in this repo.

## Ecosystem kits

An ecosystem kit is what lets `ens` manage packages in a language: finding a
package and what it links to, moving packages to a new version during a release,
scaffolding a library, and naming the lockfiles a release commit must carry. A
project lists its ecosystems in `.ensemble/config.yaml`:

```yaml
ecosystems:
  - cargo
```

Each name is a kit at `.ensemble/kits/ecosystem/<name>`, whose `main.ts` calls
`KitSdk.Ecosystem.run`. `deno` is built in, and is what a project listing none
uses. One repository can list several; the first is the default for
`ens lib new`, and `--ecosystem` picks another. Two ecosystems claiming the same
directory is an error, while one package nested inside another's directory is
fine.

A package keeps only its own manifest in its folder. Everything else a language
needs lives in `.ensemble/ecosystems/<name>`, and each ecosystem keeps it up to
date through a `sync` operation that `ens` runs ahead of builds:

- `deno`: `settings.json` holds what's shared, such as `compilerOptions`, and is
  yours to edit. `ens app create react` adds the `compilerOptions` React needs
  here, leaving alone any you've set. `deno.json` is generated from it and every
  package's manifest: commit it, and don't edit it. `deno.lock` sits beside
  them.
- `cargo`: the workspace's `Cargo.toml` and `Cargo.lock`, and `target/`. `sync`
  lists every crate under `source/` as a member and adds the `workspace` line
  each crate needs to find this root. A crate that had its own `Cargo.lock` has
  it moved into this one, keeping its pinned versions.

To have everyone on one version of a language's tools, pin it under `tools:`, by
ecosystem and then tool:

```yaml
tools:
  cargo:
    rust: 1.90.0
  deno:
    deno: "2.9"
```

Quote a version with fewer than three parts, since YAML reads `1.90` as the
number `1.9`. Each ecosystem decides what a pin means through its
`environmentFor` operation, and refuses a tool it doesn't know:

- `cargo` pins `rust`, by setting `RUSTUP_TOOLCHAIN` for everything `ens`
  starts. rustup fetches that version if it's missing, and any name rustup
  accepts works, such as `stable`. A `rustc` not managed by rustup can't switch,
  so a numbered pin it doesn't match is refused.
- `deno` pins `deno`, which `ens` can only check: its kits run on whichever
  `deno` is on the PATH, so a different version is refused, with the command to
  fix it.

A pin applies to what acts on the project, such as builds, packs, releases and
`ens exec`. It doesn't reach a tool you run yourself: plain `cargo` in a crate
uses rustup's own default, as does an editor's rust-analyzer.

Run a language's own tool through [`ens exec`](../reference/cli/exec.md), which
points it at these files. `cargo` also works directly from inside a crate. Plain
`deno` can't resolve imports between packages without
`--config .ensemble/ecosystems/deno/deno.json`, and an editor needs the same
path as its `deno.config` setting.

A project with a `deno.json` at its repository's root keeps working as it always
has: that file stays its workspace root, and nothing is generated.

Kits themselves still run on Deno, whatever language the project is written in.

Built-in ecosystem kit: `cargo`.

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
