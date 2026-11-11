# Writing an ecosystem kit

An ecosystem kit teaches `ens` one language's packaging: where its workspace
files live, which folders are its packages and what they depend on, how a
release moves them to a new version, and how to run the language's own tools.
`deno` is built into `ens`; `cargo` is the built-in example of a kit. Read
[Ecosystem kits](../concepts/kits.md#ecosystem-kits) first for what a project
sees.

## Scaffold it

```sh
ens kit new go ecosystem
```

This creates `.ensemble/kits/ecosystem/go` with a `kit.yml` (`role: ecosystem`,
`protocol: 1`) and a `main.ts`. List the kit's name under `ecosystems:` in
`.ensemble/config.yaml` for the project to use it.

## The contract

`main.ts` hands `KitSdk.Ecosystem.run` one function per operation. `ens` runs
the kit as a subprocess, once per operation, from anywhere in the project:
`repoRoot` is the project's root, and each function's return value goes back to
`ens` as JSON.

```ts
import * as KitSdk from "@ensemble/kit-sdk";

await KitSdk.Ecosystem.run({
  initialize: (repoRoot) => ...,
  sync: (repoRoot) => ...,
  packageAt: (repoRoot, directory) => ...,
  stamp: (repoRoot, version, targets) => ...,
  scaffoldLibrary: (repoRoot, directory, name) => ...,
  lockfiles: (repoRoot) => ...,
  invocation: (repoRoot, tool, args) => ...,
  environmentFor: (repoRoot, versions) => ...,
});
```

| Operation         | `ens` calls it                                                                                               | It must                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialize`      | when the ecosystem joins a project: `ens init`, or `ens app create` / `set-build-kit` adding it.             | Write the files a new project needs under `.ensemble/ecosystems/<name>`. Leave files that already exist alone.                                                                                            |
| `sync`            | before every build and pack, on `ens exec` and `ens sync`, and after `ens app create` and `ens lib install`. | Bring everything derived from the packages on disk up to date: the workspace's member list, whatever each package needs to find the root. Cheap when nothing changed.                                     |
| `packageAt`       | to find which ecosystem a folder belongs to, and its links.                                                  | Return the package whose manifest sits directly in `directory` — its published `name` (if any), and its `links` to other packages in the project — or `undefined` when there's none of yours there.       |
| `stamp`           | in a release, and before `ens lib publish`.                                                                  | Move each target to `version`, repin every package that depends on one, update the lockfile, and return every file it changed outside the targets' own folders. Ignore targets that aren't your packages. |
| `scaffoldLibrary` | on `ens lib new … --ecosystem <name>`.                                                                       | Create a library at version `0.0.1` in `directory` and make it a member of the workspace.                                                                                                                 |
| `lockfiles`       | when a release commits.                                                                                      | Return the lockfiles that exist, so the release commit carries them.                                                                                                                                      |
| `invocation`      | on `ens exec <tool> …`.                                                                                      | For a tool that's yours, return the `args` to run it with and, if the tool only finds the workspace from there, a `cwd`. Return `undefined` for any other tool.                                           |
| `environmentFor`  | before anything `ens` starts, with the project's `tools.<name>`.                                             | Return the environment variables that make those versions run, or throw when this machine can't provide one.                                                                                              |

A `link` is a dependency on another package in the same repository:
`{ specifier, target, devOnly? }`, where `specifier` is what the manifest calls
it, `target` the other package's name, and `devOnly` marks one only tests need.
`ens` orders library publishes from these, ignoring `devOnly` ones.

## Rules

- **Only manifests stay visible.** A package's folder keeps its own manifest and
  nothing else of yours. A workspace root, a lockfile and a build cache all go
  under `.ensemble/ecosystems/<name>`. The `cargo` kit keeps `Cargo.toml`,
  `Cargo.lock` and `target/` there, and `sync` points each crate at that root.
- **Act only on your own packages.** A project can list several ecosystems, and
  `ens` tells each of them the same thing: a `stamp` target or a folder that
  isn't yours is none of your business.
- **Refuse what you can't honour.** For `environmentFor`, build a
  `KitSdk.Ecosystem.ToolVersions(name, versions, knownTools)`. It refuses a tool
  you don't pin, and its `refuseUnlessSatisfied(tool, versionOutput, remedy)`
  refuses a version that doesn't match the pin. The `cargo` kit sets
  `RUSTUP_TOOLCHAIN` and checks `rustc --version`.
- **Fail with a message that says what to do.** Throw an `Error`. `ens` prints
  its message as the only line, and `ENS_DEBUG=1` adds the stack.

## Build kits for the language

An ecosystem manages packages; it doesn't build them. Building is a build kit's
job, as for any app. A build kit whose apps must belong to the ecosystem says so
in its `kit.yml`:

```yaml
role: build
protocol: 1
ecosystem: go
```

`ens app create` and `ens config set-build-kit` then add the ecosystem to a
project that doesn't list it yet. The built-in `cargo` build kit declares
`ecosystem: cargo`.

## Reference implementation

Read `.ensemble/kits/ecosystem/cargo`: `main.ts` wires each operation to a
`Workspace` class in `workspace.ts`, and `lockfile.ts` merges a crate's own
`Cargo.lock` into the workspace's without lowering a version the workspace
already locks.
