---
name: ensemble
description: How to work in an Ensemble (`ens`) project — a repository with `.ensemble/config.yaml`, `source/apps`, `source/ship` and `ci/<name>/delivery.yml`. Use whenever you add or change an app, library, ship, kit or delivery manifest, decide where a file belongs, or run `ens` to build, pack, deploy, develop, release or inspect anything; also when working on the ensemble repository itself.
---

# Working in an Ensemble project

Ensemble is a workspace layout plus a CLI, `ens`, that takes a project from
source → **build** → **pack** → (**publish**) → **deploy**. The CLI only
dictates contracts: _how_ each step happens is a pluggable **kit** under
`.ensemble/kits`, and _what_ a deployment contains is declared in a **delivery
manifest**, `ci/<name>/delivery.yml`. Think of `ens` as a stage manager: it
knows the running order and who goes on when, while the kits are the performers.

## First moves

1. **Get names from `ens status --json`**, never by guessing or grepping. It
   lists every app (with its build kit), kit by role, library, and workload
   (with its ships, resources and tasks). Every command's argument is one of
   these names.
2. **Ask the CLI for flags:** `ens <command> --help`. The summary in
   [references/cli.md](references/cli.md) covers each command's purpose and the
   traps.
3. **If `CONTRIBUTING.md` exists at the root, read it before changing code.**
   Its conventions (code style, commit scopes, how to run checks) are binding.
   In the ensemble repository itself, it also says how to run `ens` from source.

## Where things go

```
source/apps/<name>/              app source; <name> may nest: my_app/server
source/ship/<name>/              packaging inputs for a ship (Dockerfile, compile.yml, tauri.yml, ship.yml)
source/core/<name>/              shared code that speaks this project's domain
source/libs/<name>/              generic code reusable across projects (vendored ones have their own git)
source/integrations/<kit>/<app>/ an app's wiring for one deploy kit's platform
source/envs/{build,pack}/<n>.env shared default build/pack vars
source/artifacts/                build and pack output — generated, gitignored
.ensemble/config.yaml            app → build kit, ship → pack kit, workload → deploy kit, publish, hooks
.ensemble/config.local.yaml      personal var defaults, gitignored
.ensemble/kits/<role>/<kit>/     kits: build, pack, deploy, lib, ecosystem
.ensemble/ecosystems/<language>/ each language's workspace root and lockfile
ci/<name>/delivery.yml           a workload: release, deploy, launch, tasks
ci/<name>/dev.env                development values `ens develop` loads
docs/                            the project's documentation
```

Placement decisions:

| You need to…                                      | Put it in                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| add a deployable program                          | `ens app create <build kit> <name>`, which scaffolds it and registers its kit                     |
| share code between apps of _this_ project         | `source/core/<name>`, imported by package name, never by reaching into another app's folder       |
| share code with _other_ projects                  | `ens lib new <name>` → `source/libs/<name>`                                                       |
| package an app (image, binary, archive)           | `source/ship/<name>`, with the pack kit's own config                                              |
| bind an app to a platform's resources (DynamoDB…) | `ens app create <kit> <app> --integration <deploy kit>`                                           |
| describe what runs where                          | `ci/<name>/delivery.yml` — see [references/delivery-manifest.md](references/delivery-manifest.md) |
| run something once after a deploy (a migration)   | a `tasks:` entry in the manifest, with its script in `ci/<name>/<kit>/tasks/`                         |
| support a new app type, format or target          | a new kit: `ens kit new <name> <role>` — see [references/kits.md](references/kits.md)             |

## Rules

- **App folders state _which_ kit, never _how_.** No build scripts, bundler
  configs or Dockerfiles in `source/apps`. Packaging goes in `source/ship`,
  tooling in a kit.
- **Only package manifests stay visible.** A package folder holds its code and
  its own `deno.json`/`Cargo.toml`/`package.json`. Workspace roots, lockfiles
  and tool configs live under `.ensemble/ecosystems/<language>`.
  `.ensemble/ecosystems/deno/deno.json` is generated from `settings.json`: edit
  `settings.json`, then run `ens sync` and commit what changes.
- **Run a language's own tools through `ens exec`** (`ens exec deno test …`,
  `ens exec cargo test -p …`) so they find those files. Plain `deno` needs
  `--config .ensemble/ecosystems/deno/deno.json`.
- **Environments aren't an `ens` concept.** A manifest declares `variables` and
  `secrets`, and their values come from the process environment, which a
  pipeline sets. Locally they come from `ci/<name>/dev.env`,
  `ci/<name>/<kit>.env`, or the untracked `.ensemble/deploy/<name>/secrets.env`.
  Never add a mode flag, a per-environment manifest, or a kit branch for "dev".
- **Kits are environment-agnostic.** One kit serves the real target and its
  local stand-in (MiniStack for `aws`). Which one is decided by the environment,
  such as `AWS_ENDPOINT_URL`.
- **Wire resources by reference, not by hand.** Use `${databases.db.host}`,
  `${compute.api.host}:${compute.api.http}` or `${release.web}`, never a
  hardcoded container name, port or image tag. A written-out hostname is just a
  string to `ens`: it creates no dependency and no ordering.
- **Vendored kits and libraries belong upstream.** If
  `.ensemble/vendor.lock.yml` lists one, change it there and pull it in
  (`ens kit|lib contribute`, `update`, `pin`), or say that you're making a local
  fork.
- **Generated output isn't source.** Never edit `source/artifacts/`,
  `.ensemble/deploy/`, `.ensemble/cache/` or a generated `deno.json`.

## Running commands safely

- **Long-running commands block.** `ens develop` and every `--watch` run until
  stopped. Start them in the background and read their output, or, over MCP, use
  `ensemble_develop_start` / `ensemble_watch_logs` / `ensemble_watch_stop`. Stop
  what you start.
- **Preview before you apply.** `ens deploy <name> <kit> --plan` shows the
  intent diff, `--eject` writes the rendered artifact, and
  `ens deploy <name> <kit> explain <category.name>` shows why a resource
  resolved the way it did. `ens delivery print <name>` shows the architecture
  without needing a kit or any secrets.
- **Ask first** before anything that reaches beyond this machine or can't be
  undone: `ens release`, `ens publish`, `ens lib publish`, `ens deploy` to a
  non-local target, `ens destroy` (compose runs `down --volumes`, which deletes
  data), `ens kit|lib eject`, and `ens kit|lib contribute`.
  `ens release … --dry-run` is safe and checks publish authorization.
- **When a kit fails,** its message is the whole error. Rerun with `ENS_DEBUG=1`
  (or `--verbose`) for the stack and the kit's command line.

## The loop, end to end

```sh
ens status --json                      # what exists
ens app create deno.bundle api         # new app, registered with its build kit
ens build api                          # → source/artifacts/api
ens pack api docker                    # ship source/ship/api → local image api:latest
ens develop shop                       # build + pack + deploy ci/shop/delivery.yml locally, watching
ens delivery shop compose tasks        # list the workload's one-off tasks
ens deploy shop aws --plan             # what a real deploy would change
ens release next minor --dry-run       # what a release would tag, pack and publish
```

## References

- [references/cli.md](references/cli.md): every command, what it's for, and its
  traps.
- [references/delivery-manifest.md](references/delivery-manifest.md): the
  manifest's sections, reference grammar, resource kinds, variables, secrets,
  tasks and launch.
- [references/kits.md](references/kits.md): the five kit roles and their
  contracts, for writing or changing a kit.
- The full manual, when the project has one: `docs/documentation/` (in the
  ensemble repository) or
  <https://github.com/ritajhq/ensemble/tree/main/docs/documentation>.
