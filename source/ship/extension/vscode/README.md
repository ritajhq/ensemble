# Ensemble

Editor support for [Ensemble](https://github.com/ritajhq/ensemble) workspaces,
served by the `ens` CLI's own language server, so suggestions always match
what the installed `ens` will accept.

## Features

- **Reference completion in delivery manifests.** In `ci/<name>/delivery.yml`
  (or an extensionless `ci/<name>/delivery`), typing `${` suggests every
  reference the manifest makes available: `${release.<name>}`, each
  resource's outputs (`${databases.db.host}`), a compute's ports,
  `variables`/`external` fields, and `${deployment.*}` inside `tasks:`.

More is on the way: structure and value completion, diagnostics, hover and
go-to-definition, and a dependency-graph view of a manifest.

## Requirements

The `ens` CLI on your `PATH`, at a version that has the `ens lsp` command:

```sh
curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh
```

The extension finds `ens` at `~/.ensemble/bin/ens` (where the installer puts
it) or on your `PATH`. If you installed it elsewhere, set `ensemble.executable`
to its path.

The extension activates in any workspace with a `ci/*/delivery.yml` or
`ci/*/delivery` file.
