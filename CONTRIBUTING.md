# Contributing to Ensemble

This repository is an `ens` project that builds `ens`: the CLI, its kits, the
platform, the website and the VS Code extension all live in the workspace layout
the [documentation](docs/documentation/concepts/workspace-layout.md) describes.
Read that page and [Kits](docs/documentation/concepts/kits.md) first. This file
covers only what's specific to working on Ensemble itself.

## Where things live

| Path                                  | What it is                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `source/apps/cli`                     | The `ens` entry point: `main.ts` registers every command; `commands/` parses flags; `mcp/` and `lsp/` are the agent and editor adapters. |
| `source/core/core`                    | `@ensemble/core` — what each command does. Thin orchestration over kits, published to JSR.                                               |
| `source/core/core/deploy`             | The delivery model: manifest parsing, contracts, references, render, terminations, `explain`. Heavily commented; read it for edge cases. |
| `source/core/host`                    | `@ensemble/host` — runs kits: `kit-host.ts` hosts a deploy kit in a child process and talks to it over RPC.                              |
| `source/core/kit-sdk`                 | `@ensemble/kit-sdk` — what kits import (`KitSdk.Build`, `KitSdk.Pack`, `KitSdk.Deploy`, `KitSdk.Ecosystem`, …).                          |
| `source/core/delivery`                | `ens delivery print`'s architecture model and drawing.                                                                                   |
| `.ensemble/kits/<role>/<kit>`         | The built-in kits. `ens init` copies this folder into new projects, so a kit change ships to users.                                      |
| `source/apps/mock`                    | A polyglot test project (Rust, Deno, Tauri) and `exercise.ts`, which runs user scenarios against the working tree's `ens`.               |
| `source/apps/platform`, `ci/platform` | The platform: releases, deploys and branch previews from a web UI.                                                                       |
| `source/apps/website`, `ci/website`   | The website, which publishes `docs/documentation`.                                                                                       |
| `source/apps/extension/vscode`        | The VS Code extension, a client of `ens lsp` and `ens status --json`.                                                                    |

## Running and checking a change

There's no `deno.json` at the root: the Deno workspace is generated into
`.ensemble/ecosystems/deno/deno.json` (edit `settings.json` beside it, never the
generated file). Plain `deno` needs it passed explicitly, or go through
`ens exec deno`, which does that for you:

```sh
CFG=.ensemble/ecosystems/deno/deno.json

deno task --config $CFG cli <command> ...       # run ens from source, e.g. `cli build website/server`
deno task --config $CFG compile                  # compile ens into .ensemble/bin/ens
deno fmt   --config $CFG <files>
deno lint  --config $CFG <files>
deno check --config $CFG <files>
deno test  --config $CFG -A <files or folders>   # or: ens exec deno test -A source/core
```

- Run the smallest check that covers what you touched: the files, or the one
  package, not the whole repository.
- `deno test` type-checks. Don't reach for `--no-check` to make a failure go
  away before you understand it.
- `source/libs/ui` is a vendored library with its own formatting; format it from
  inside its folder.
- A change to how `ens` behaves in a real project (layout, kits, ecosystems,
  release) can be exercised end to end with the mock:
  `deno run -A --no-config source/apps/mock/exercise.ts --sandbox <dir> --only <scenario>`.
  See [its README](source/apps/mock/README.md).
- Don't add tests, harnesses or screenshots nobody asked for.

## Code conventions

These apply to new code, and to code you're already changing; the older
`run*`-function style in `source/core/core` is being moved to them gradually.

- **TypeScript, named in the domain's terms.** `Workload`, `Provisioner`,
  `ReleaseLocator`, never `Manager`/`Helper`/`Data`.
- **Namespaces come from imports, not names.** A module exports `Kit`, not
  `DeployKit`; the consumer writes `Deploy.Kit`. Each package re-exports its
  public surface from an `index.ts` barrel, and sub-modules as namespaces
  (`export * as Manifest from "./manifest/index.ts"`).
- **Classes with constructor-injected collaborators** over loose functions and
  module state. Collaborators that do things get commands ("do this"), not
  queries; value objects and repositories may expose reads.
- **Dependencies point inward.** `core` never imports `host`, `apps` or a kit; a
  kit reaches `ens` only through `@ensemble/kit-sdk`. Add an interface only once
  a second implementation needs it.
- **Guard clauses, not `else`; lookup or polymorphism, not `if/else if`
  ladders** that pick behaviour.
- **Events through `@duesabati/evento`.** Expose an `Emitter` (`OnStart`), keep
  the `Delegate` private, and only the owner calls `Invoke`.
- **The CLI hardcodes no kit.** A new app type, packaging format or target is a
  new kit under `.ensemble/kits`, never a branch in `source/core`.
- **Kits are environment-agnostic.** The same kit deploys to a real cloud and to
  its local stand-in (MiniStack for `aws`); which one is decided by the process
  environment, never by a flag or a mode.
- **Only manifests stay visible.** A package's folder holds its code and its own
  manifest; every other tool file goes under `.ensemble/`, by ecosystem.
- **Errors say what to do.** A failing kit throws an `Error` whose message names
  the problem and the fix; `ens` prints it as the only line (`ENS_DEBUG=1` adds
  the stack).

## Kits in other repositories

The `pack/docker` and `deploy/compose` kits are vendored into other repositories
(idhn, khatm, portal). Change them here first, then copy them out.

## Documentation

- `docs/documentation` is the user manual and is published by the website as is:
  its folders are the site's sections, so keep pages there for users of `ens`,
  not for contributors.
- A behaviour change updates the page that describes it, in the same commit. The
  CLI reference (`docs/documentation/reference/cli`) mirrors the commands
  registered in `source/apps/cli/main.ts`.
- `docs/<workload>/architecture.*` are generated by
  `ens delivery print <workload> --render markdown`; regenerate them, don't edit
  them.
- `docs/delivery.schema.json` is kept in step with the manifest parser.
- `.claude/skills/ensemble` is what an agent learns about `ens`. Update it when
  a command, the layout, or a convention it describes changes.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), one summary line,
no body and no trailers.

The **type** is what the diff does: `feat`, `fix`, `refactor`, `test`, `docs`,
`style`. `chore` is only for a release, the changelog or a lockfile — those come
from `ens release` and its changelog hook.

The **scope** names where the change is:

| Changed                 | Scope                                 | Example                           |
| ----------------------- | ------------------------------------- | --------------------------------- |
| `source/apps/<name>`    | `<name>`, nesting included            | `fix(extension/vscode): …`        |
| `source/core/<name>`    | `core/<name>`                         | `fix(core/core): …`               |
| `source/libs/<name>`    | `libs/<name>`                         | `feat(libs/ui): …`                |
| `source/ship/<name>`    | `ship/<name>`                         | `fix(ship/platform-guard): …`     |
| `ci/<name>`             | the workload                          | `feat(platform): …`               |
| `.ensemble/kits`        | `kits`, or `<role>/<kit>` for one kit | `feat(pack/tauri): …`             |
| a feature across layers | the command or feature                | `feat(develop): …`                |
| `docs/`, `README.md`    | type `docs`; scope optional           | `docs: describe running a launch` |

## Releasing

`ens release next <patch|minor|major>` tags, publishes `@ensemble/core`,
`@ensemble/host` and `@ensemble/kit-sdk` to JSR, the CLI binary to GitHub, the
extension to the Marketplace and the platform's images to ghcr.io, then updates
`CHANGELOG.md`. It needs the credentials in `.ensemble/release/secrets.env` and
checks every one before changing anything. It's outward-facing: never run it
without being asked. See
[`ens release`](docs/documentation/reference/cli/release.md).
