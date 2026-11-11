# Ensemble

Editor support for [Ensemble](https://github.com/ritajhq/ensemble) workspaces,
served by the `ens` CLI's own language server, so suggestions always match what
the installed `ens` will accept.

## Features

In `ci/<name>/delivery.yml` (or an extensionless `ci/<name>/delivery`):

- **Reference completion.** Typing `${` suggests every reference the manifest
  makes available: `${release.<name>}`, each resource's outputs
  (`${databases.db.host}`), a compute's ports, `variables`/`external` fields,
  and `${deployment.*}` inside `operations:`.
- **Structure completion.** The keys each mapping may hold, required ones first,
  including a resource's own fields once its `type:` is set, and the values
  `type:`, `class:`, `version:` and a secret's `source:` may take.
- **Problems as you type.** Everything `ens deploy` would reject before
  deploying — unknown keys, missing fields, references to undeclared resources,
  reference cycles — marked on the line it's about, all at once.

More is on the way: value completion from the project (kits, releases), hover
and go-to-definition, and a dependency-graph view of a manifest.

## Requirements

The `ens` CLI on your `PATH`, at a version that has the `ens lsp` command:

```sh
curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh
```

The extension finds `ens` at `~/.ensemble/bin/ens` (where the installer puts it)
or on your `PATH`. If you installed it elsewhere, set `ensemble.executable` to
its path.

The extension activates in any workspace with a `ci/*/delivery.yml` or
`ci/*/delivery` file.
