# Editor support

Ensemble's editor support lives in `ens` itself, as a language server
(`ens lsp`). Editor extensions only connect an editor to it. The knowledge of
what a manifest may contain — its resource contracts, its `${...}` reference
grammar, which releases and resources exist — is already `@ensemble/core`'s,
so the language server reuses it rather than restating it in a JSON schema. An
editor's suggestions can then never drift from what `ens deploy` accepts: they
come from the same `ens` that will run the file.

```
VS Code ── extension (source/apps/extension/vscode)
              │ starts, over stdio
              ▼
           ens lsp (source/apps/cli/lsp) ── protocol adapter
              │ asks
              ▼
           @ensemble/core ── contracts, reference grammar, manifest parser
```

Any editor with an LSP client (Neovim, Zed, Helix, JetBrains) can use
`ens lsp` the same way; the VS Code extension is just the first client.

## What's supported

| File                  | Feature                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci/*/delivery(.yml)` | **Reference completion** — typing `${` suggests every reference the manifest makes available: `${release.<name>}`, each resource's contract outputs (`${databases.db.host}`), a compute's ports, `variables`/`external` fields, and — under `tasks:` — `${deployment.*}`. |

While a manifest is mid-edit and doesn't parse, completion keeps working from
the last version of it that did.

## Roadmap

Grouped by the mechanism each feature needs, from cheapest to richest.

### Language server (`ens lsp`)

Replaces a JSON schema entirely: one server, one document handler per file
kind.

- [x] `${...}` reference completion in `delivery.yml`.
- [ ] Structure completion — keys under `release:`/`deploy:`/`tasks:`, and a
      resource's params once its `type:` names a contract.
- [ ] Value completion — `kit:` from the kits under `.ensemble/kits/`, a
      release's `publish.target` from its pack kit's `kit.yml`, a `release:`
      key from the ships under `source/ship/`.
- [ ] Diagnostics — the parser's and `ReferenceValidator`'s errors, mapped to
      the offending line and column. Needs a position-preserving YAML parse
      on the server side; core keeps validating plain values.
- [ ] Hover and go-to-definition on a reference; renaming a resource updates
      its references.
- [ ] More files — `.ensemble/config.yaml`, a ship's `compile.yml`,
      `ci/<name>/<kit>.config.yml`.

### Declarative (extension manifest only)

- [ ] Shell syntax highlighting inside `run:` blocks (TextMate grammar
      injection).

### CLI-backed actions

Every action runs its `ens` command in an "Ensemble" terminal, so output stays
visible and interactive prompts keep working.

- [x] **Sidebar** (Ensemble logo in the activity bar): one collapsible pane
      per section of `ens status --json`, loaded once and shared —
      **Apps** (build), **Workloads** (develop, deploy, release; each
      workload's ships, resources and tasks, and running a task with input),
      **Kits** and **Libraries** (new, install, update, pin, contribute,
      eject, uninstall; libraries also publish). Refreshes when
      `.ensemble/config.yaml`, the vendoring lockfile, a kit or a delivery
      manifest changes, and when `ens` itself is updated.
- [x] **Running a task**: asks for the deploy kit to resolve its
      `arguments:` with and any input to hand it as `$1..$n`, preselecting the
      last answers for that task, then runs `ens delivery task`.
- [x] **Code lenses** in delivery manifests: Develop and Deploy… above
      `deploy:`; Release… above `release:` — once, not per ship, because
      `ens release` packs and publishes every workload's releases together.
      Deploy… asks for the deploy kit, mode (apply/plan/eject), artifacts and
      version, preselecting the last answers for that workload.
- [x] **Status bar**: the installed `ens` version, flagged when it's older
      than the extension (released together, under one version) with a click
      to update it.
- [ ] Package and Publish lenses above `release:` — need CLI commands that
      pack or publish every declared release without tagging.

### Custom views

- [ ] `delivery.yml` rendered as its dependency graph, as a custom editor
      beside the text (like the Markdown preview).

## Developing the VS Code extension

The extension is an ordinary app (`source/apps/extension/vscode`, built with
`deno.bundle` as CommonJS with `vscode` external) packed by the `vscode` pack
kit together with its manifest (`source/ship/extension/vscode/extension.json`,
written out as the `package.json` VS Code requires):

```sh
ens pack extension/vscode vscode
code --extensionDevelopmentPath=$PWD/source/artifacts/packages/extension/vscode
```

Repack and run **Developer: Reload Window** in that window after a change. It
starts `ens lsp` from your `PATH`, so language features need an `ens` that has
the `lsp` command. Its release is declared in
`ci/vscode-extension/delivery.yml` and published to the Visual Studio
Marketplace by `ens release` (`VSCE_PAT` must hold a Marketplace token).
