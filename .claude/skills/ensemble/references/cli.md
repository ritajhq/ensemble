# `ens` command summary

`ens <command> --help` is authoritative for flags. This page covers what each
command is for and the traps an agent hits. `ens mcp` exposes the same commands
as MCP tools (`ensemble_<command>[_<subcommand>]`) with identical arguments.

`<app>` and `<ship>` are paths under `source/apps` / `source/ship`, nesting
included (`my_app/server`). `<name>` for a workload is the folder under `ci/`.

## Discover

| Command                     | Use it to                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `ens status [--json]`       | list every app, kit, library and workload — the names other commands take. Run it first.           |
| `ens delivery print <name>` | print a workload's architecture (`-r markdown` writes `docs/<name>/architecture.*`). Needs no kit. |
| `ens version`               | show the installed `ens`; `update [patch\|minor\|major]` / `set <v>` change it.                    |

## Scaffold and configure

| Command                                                | Notes                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `ens init [name] [--ecosystem <e>]`                    | Creates a new project folder with the layout and the built-in kits. Refuses if the folder exists.                                |
| `ens app create <build kit> <app> [--target <t>]`      | Scaffolds the app and registers `build.<app>.kit`. Adds the kit's ecosystem to the project if it needs one.                      |
| `ens app create <build kit> <app> --integration <kit>` | Scaffolds `source/integrations/<kit>/<app>` for an existing app. The `integrations/` prefix is reserved.                         |
| `ens config set-build-kit <app> <kit>`                 | Registers an existing folder's kit.                                                                                              |
| `ens config set-build-var <app> K=V` / `set-pack-var`  | Personal defaults in `config.local.yaml`. Shared defaults belong in `source/envs/{build,pack}/<n>.env`.                          |
| `ens lib new <name> [--ecosystem <e>]`                 | Scaffolds `source/libs/<name>`.                                                                                                  |
| `ens kit new <name> <role>`                            | Scaffolds `.ensemble/kits/<role>/<name>`; role is `build`, `pack`, `deploy`, `lib` or `ecosystem`.                               |
| `ens sync`                                             | Regenerates each ecosystem's workspace files after a manifest was edited by hand. Commit the result.                             |
| `ens exec <tool> [args…]`                              | Runs `deno`/`cargo`/… against `.ensemble/ecosystems`. `cargo` runs from its ecosystem folder, so its paths are relative to that. |

## Build, pack, publish

| Command                                                      | Notes                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ens build <app> [-m development\|production] [-w] [-v K=V]` | Writes to `source/artifacts/<app>`. An app with `integrations` builds every one of them. Vars: env file < `config.local.yaml` < `-v`.                   |
| `ens pack <ship> [kit] [-m <mode>] [-o <name>] [-w]`         | Builds the apps the kit says the ship uses (`dependencies.ts`), then packs. Modes come from the kit's `kit.yml`. The kit defaults to `pack.<ship>.kit`. |
| `ens publish <ship> <kit> <target> [--version <v>]`          | **Outward-facing.** The kit's `authorize.ts` runs first, and a refusal, or a missing `authorize.ts`, publishes nothing.                                 |
| `ens lib publish <name> <kit> <version>`                     | **Outward-facing.** Publishes one library outside a release.                                                                                            |

## Deploy and run

| Command                                              | Notes                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ens develop <name> [-k <kit>]`                      | **Blocks.** Shorthand for `deploy --artifacts local --emulate-externals --watch`, plus the kit's local runtime (the HTTPS proxy for compose, MiniStack for aws) and the manifest's `launch:` section. Loads `dev.env`, `<kit>.env` and `secrets.env`. |
| `ens deploy <name> [kit]`                            | Applies by default. `--plan` shows the diff, `--eject` renders only, `--watch` blocks. `--artifacts local\|published` (default `published`), `--version`, `--instance <slug>`, `--env-file`. Reads **no** env file unless given one.                  |
| `ens deploy <name> <kit> explain <category.name>`    | Shows which provisioner matched, where each value came from, and the resolved outputs.                                                                                                                                                                |
| `ens destroy <name> [kit] [--instance <slug>]`       | **Destructive.** On compose it runs `down --volumes`, which deletes data. Never touches externals.                                                                                                                                                    |
| `ens delivery task <name> [task] [args…] [-k <kit>]` | With no task, lists them. Otherwise runs one, with arguments resolved from the last deploy's snapshot or a fresh render. Trailing args become `$1..$n`.                                                                                               |

The deploy kit defaults to `deploy.<name>.kit` in `.ensemble/config.yaml`. A kit
given on the command line wins. `ens develop` falls back to `compose`.

Common failures:

- **No matching provisioner "… in the `<kit>` deploy kit"**: the kit can't
  deploy that resource kind (a `function` on compose, say). Pick the right kit
  with `-k` or set `deploy.<name>.kit`.
- **Missing values**: every variable without a `default:` and every
  environment-sourced secret must be set. The error names all of them. Supply
  them through the environment or an env file, never by editing the manifest.
- **Image not found (compose)**: `--artifacts local` resolves to the locally
  packed `<ship>:latest`. Pack it, or drop `--no-pack`.

## Release

| Command                                     | Notes                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ens release next <patch\|minor\|major>`    | **Outward-facing.** Checks publish authorization, stamps library versions, tags, packs and publishes every release, then runs `hooks.release.after`. |
| `ens release set <x.y.z>`                   | The same, with an explicit version.                                                                                                                  |
| `ens release resume <tag> [--only\|--skip]` | Finishes a release that failed partway, from `.ensemble/release/state/<tag>.json`.                                                                   |
| `ens release undo`                          | Deletes the last tag locally, and offers to delete it on the remote.                                                                                 |

`--dry-run` is safe and reports whether authorization would refuse. `-y` answers
every prompt, so use it only when you've been told to release.

## Kits and libraries

`ens kit …` and `ens lib …` share the same lifecycle: `install <url>[@ref]`,
`pin <name> <ref>`, `update <name> [patch|minor|major]`, `contribute <name>`
(pushes and opens a PR), `eject` (pushes a local one to its own repository; for
`kit` the remote is positional, for `lib` it's `--remote`), and
`uninstall|rm [-f]`. Every one except `pin`/`update` on a local checkout touches
a remote, so ask first.

## Editor and agent servers

`ens lsp --stdio` is the language server: completion of keys, closed values and
`${…}` references in `delivery.yml`, and every problem `ens deploy` would find
before it needs a kit, marked as you type. `ens mcp` is the MCP server. Over
MCP, watch commands return a session id, so poll it with `ensemble_watch_logs`
and end it with `ensemble_watch_stop`.
