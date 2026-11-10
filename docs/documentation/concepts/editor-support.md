# Editor support

Ensemble's editor support lives in `ens` itself, as a language server
(`ens lsp`). Editor extensions only connect an editor to it. The knowledge of
what a manifest may contain — its resource contracts, its `${...}` reference
grammar, which releases and resources exist — is already `@ensemble/core`'s, so
the language server reuses it rather than restating it in a JSON schema. An
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

Any editor with an LSP client (Neovim, Zed, Helix, JetBrains) can use `ens lsp`
the same way; the VS Code extension is just the first client.

## What's supported

In `ci/*/delivery.yml` (or an extensionless `ci/*/delivery`):

- **Reference completion.** Typing `${` suggests every reference the manifest
  makes available: `${release.<name>}`, each resource's contract outputs
  (`${databases.db.host}`), a compute's ports, `variables`/`external` fields,
  and — under `tasks:` — `${deployment.*}`.
- **Structure completion.** At the start of a line, the keys that mapping may
  hold, less those it already has, required ones first: the envelope's sections,
  the categories under `deploy:`, the fields of a release, task, launch entry,
  secret, variable or external, and a resource's own params once its `type:`
  names a contract. After a key, the values it takes where they're a closed set:
  a resource's `type:` from its category's contracts, its `class:`, `version:`,
  a secret's `source:`, a variable's or launch entry's `type:`.
- **Diagnostics.** Every problem `ens deploy` would find before it needs a
  deploy kit, all at once, each on the key it's about: unknown or missing keys,
  a resource's fields against its contract, `${...}` references to anything
  undeclared, and reference cycles. Until the text is valid YAML, its syntax
  errors are shown instead.

The keys, types and fields all come from `@ensemble/core`: the lists the parser
checks against and the contracts the deploy validates with. While a manifest is
mid-edit and doesn't parse, completion works from as much of it as reads.

Not covered yet: values that depend on the project rather than the manifest
(`kit:`, a release's name), the fields of a list item such as a `development`
sync rule, and the launch section's checks that need the project's builds and
packs.

## Roadmap

Grouped by the mechanism each feature needs, from cheapest to richest.

### Language server (`ens lsp`)

Replaces a JSON schema entirely: one server, one document handler per file kind.

- [x] `${...}` reference completion in `delivery.yml`.
- [x] Structure completion — keys under `release:`/`deploy:`/`tasks:`, and a
      resource's params once its `type:` names a contract.
- [ ] Value completion — `kit:` from the kits under `.ensemble/kits/`, a
      release's `publish.target` from its pack kit's `kit.yml`, a `release:` key
      from the ships under `source/ship/`.
- [x] Diagnostics — the parser's, the contracts' and `ReferenceValidator`'s
      errors, every one at once, mapped to the offending key. The server reads
      positions with its own YAML parse; core keeps validating plain values.
- [ ] Hover and go-to-definition on a reference; renaming a resource updates its
      references.
- [ ] More files — `.ensemble/config.yaml`, a ship's `compile.yml`,
      `ci/<name>/<kit>.config.yml`.

### Declarative (extension manifest only)

- [ ] Shell syntax highlighting inside `run:` blocks (TextMate grammar
      injection).

### CLI-backed actions

Every action runs its `ens` command in an "Ensemble" terminal, so output stays
visible and interactive prompts keep working.

- [x] **Sidebar** (Ensemble logo in the activity bar): one collapsible pane per
      section of `ens status --json`, loaded once and shared — **Apps** (build),
      **Workloads** (develop, deploy, release; each workload's ships, resources
      and tasks, and running a task with input), **Kits** and **Libraries**
      (new, install, update, pin, contribute, eject, uninstall; libraries also
      publish). Refreshes when `.ensemble/config.yaml`, the vendoring lockfile,
      a kit or a delivery manifest changes, and when `ens` itself is updated.
- [x] **Running a task**: asks for the deploy kit to resolve its `arguments:`
      with and any input to hand it as `$1..$n`, preselecting the last answers
      for that task, then runs `ens delivery task`.
- [x] **Code lenses** in delivery manifests: Develop and Deploy… above
      `deploy:`; Release… above `release:` — once, not per ship, because
      `ens release` packs and publishes every workload's releases together.
      Deploy… asks for the deploy kit, mode (apply/plan/eject), artifacts and
      version, preselecting the last answers for that workload.
- [x] **Status bar**: the installed `ens` version, flagged when it's older than
      the extension (released together, under one version) with a click to
      update it.
- [ ] Package and Publish lenses above `release:` — need CLI commands that pack
      or publish every declared release without tagging.

### Custom views

- [ ] `delivery.yml` rendered as its dependency graph, as a custom editor beside
      the text (like the Markdown preview).

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
the `lsp` command. Its release is declared in `ci/vscode-extension/delivery.yml`
and published to the Visual Studio Marketplace by `ens release` (`VSCE_PAT`, in
`.ensemble/release/secrets.env`, must hold a Marketplace token with publish
rights for the `ritaj` publisher — checked before the release changes anything).
