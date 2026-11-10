# Kits

A kit is the plug-in that does a step's actual work. `ens` treats no kit name
specially, so a new app type, packaging format or target is a new folder under
`.ensemble/kits/<role>/<name>`, never a change to `ens`. Kits run on Deno
whatever language the project uses, and reach `ens` only through
`@ensemble/kit-sdk` (`import * as KitSdk`).

Every kit has a `kit.yml` with its `role` and the `protocol` it speaks
(`protocol: 1`). `ens` refuses a kit without them. Scaffold one with
`ens kit new <name> <role>` rather than by hand.

Before writing a kit, read the closest built-in one:

| Role        | Built-in kits                                          | Best reference                    |
| ----------- | ------------------------------------------------------ | --------------------------------- |
| `build`     | `deno.bundle`, `react`, `static-page`, `cargo`         | `deno.bundle` (smallest), `react` |
| `pack`      | `docker`, `deno.compile`, `tarball`, `tauri`, `vscode` | `docker` (publish + authorize)    |
| `deploy`    | `compose`, `aws`, `cloudflare`                         | `compose` (the fullest)           |
| `lib`       | `jsr`                                                  | `jsr`                             |
| `ecosystem` | `cargo` (`deno` is built into `ens`)                   | `cargo`                           |

## build: a subprocess

`main.ts` reads `KitSdk.Build.getContext()`, which parses
`--source --name --out --mode development|production --workspace --vars <json> [--watch] [--target <t>] [--options <json>]`,
builds `source`, and writes to `out`. `--options` is the app's
`build.<app>.options` from `config.yaml`, passed through unchanged for the kit
to interpret. By convention the entry is `main.ts` → `main.js` (`KitSdk.Entry`).
An optional `scaffold.ts` supplies `ens app create`'s template. A kit whose apps
must belong to an ecosystem declares `ecosystem: <name>` in `kit.yml`.

## pack: a subprocess

`main.ts` reads `KitSdk.Pack.getContext()`: the positional ship directory plus
`--name --output-name --artifacts --packages --workspace --mode --vars <json> [--version <v>] [--watch]`.
`kit.yml` declares `modes` (mode name → kit-internal flags; the first one is the
default) and, for a kit that publishes, `publish:` targets.

- `dependencies.ts` answers with the apps the ship uses, read from the ship's
  own config (Dockerfile `COPY --from`, `compile.yml`, `tauri.yml`). `ens pack`
  builds those first. Without it, every app is built.
- `publish.ts` publishes to a target. `authorize.ts` gets the same arguments,
  only reads, and answers whether this machine may publish. Wrap the check in
  `KitSdk.Pack.authorizePublish`. Without `authorize.ts`, every publish is
  refused.

## deploy: hosted, over RPC

A deploy kit isn't a CLI. `main.ts` default-exports a `KitSdk.Deploy.Kit`, and
`ens` runs it in one long-lived `deno run` child process from the kit's folder,
calling it over RPC for as long as the command runs. Its parts:

- `provisioners()`: one provisioner per resource kind it supports (container,
  relational, gateway, …). A resource with no matching provisioner fails the
  deploy, naming the kit.
- `realization()`: how resolved resources become target artifacts.
- `present(artifacts, graph)`: the single rendered document (`compose.yaml`, a
  CloudFormation template, `plan.json`).
- `applyCommand(path, name)`: the argv that applies it. `name` is the
  deployment's identity, so use it as the compose project or stack name.
- Optional: `watchCommand`, `destroyCommand` and external emulation. If one is
  missing, that feature is reported as a gap rather than a bug.

The kit receives the **whole** workload and its dependency batches, because only
the kit knows how its target assembles them. Support differs on purpose:
document what a provisioner drops in its comments, and hard-fail rather than
silently ignore anything that would change behaviour. A kit stays
environment-agnostic. The same code targets the real service and its local
stand-in, chosen by the process environment.

## lib: publishing libraries

`main.ts` calls `KitSdk.Lib.run({ authorize, stamp, publish })`. `authorize`
only reads and gates every publish, `stamp` writes the version into the
library's manifest, and `publish` pushes it to the registry. A library lists the
kits it publishes through in `config.yaml`'s `publish:`.

## ecosystem: a language's workspace

`main.ts` calls `KitSdk.Ecosystem.run` with the operations `initialize`, `sync`,
`packageAt`, `stamp`, `scaffoldLibrary`, `lockfiles` and `invocation`, plus
`environmentFor` to honour `tools:` version pins. Every workspace file it owns
lives under `.ensemble/ecosystems/<name>`, never at the repository root or in
`source/`.

## Failing well

Throw an `Error` whose message names what went wrong and what to do about it.
`ens` prints only that line and exits 1. `ENS_DEBUG=1` adds the stack and the
kit's command line. A kit that calls `Deno.exit(n)` has `n` passed through.

## Vendored kits

A kit installed with `ens kit install` is a git checkout recorded in
`.ensemble/vendor.lock.yml`. Change it upstream (`ens kit contribute`), then
move the project to the new version (`ens kit update` / `pin`). A local edit to
a vendored kit is a fork, so say so when you make one.
