# `ens deploy`

Deploy a workload using the given deploy kit: render, then eject, plan, or
apply (the default). See [Deploying](../../guides/deploying.md) for the
full model behind these flags.

```sh
ens deploy <name> <kit>
```

- `<name>` — the workload's name, matching `ci/<name>/delivery.yml`.
- `<kit>` — the deploy kit to use (e.g. `compose`, `aws`).

## Flags

- `--artifacts <local|published>` — which release locator to resolve.
  Default: `published`.
- `--version <version>` — released version to resolve `${release.<name>}`
  references to, for published artifacts. Default: `latest`.
- `--eject` — render and write the artifact to the outputs dir, then stop.
  No apply.
- `--plan` — render and show the intent-diff against the last apply/plan,
  then stop.
- `--watch` — run the kit's long-lived watch command instead of a one-shot
  apply, torn down on Ctrl+C.
- `--no-pack` — skip packing referenced releases before a local apply
  (default: pack). Ignored for published artifacts.
- `--accept-capability-gaps` — proceed even if the target kit can't satisfy
  a requested capability (otherwise this hard-fails).
- `--emulate-externals` — before applying, stand up a local substitute for
  each declared external resource the kit knows how to emulate (e.g.
  `docker network create` for an external network) instead of assuming it
  already exists elsewhere.
- `--verbose` — let a local apply's pack step show the kit's own
  build-tool output instead of hiding it behind the pack spinner.

`--eject` and `--plan` are mutually exclusive, and neither can combine with
`--watch` or `--emulate-externals`.

```sh
ens deploy web compose
ens deploy web compose --version 1.2.3
ens deploy web compose --plan
ens deploy web aws --accept-capability-gaps
```

There is no destroy/teardown flag or subcommand — tearing a workload down
is explicitly out of scope for the current deploy model.

## `ens deploy <name> <kit> explain <resource>`

Explain one resource's resolution: which provisioner matched (and why
others didn't), each value's provenance, accepted capability gaps, and
resolved outputs.

```sh
ens deploy web compose explain databases.primary
```

- `<resource>` — given as `category.name` (e.g. `databases.primary`).
- `--artifacts <local|published>` — which release locator to resolve.
  Default: `published`.
- `--version <version>` — released version to resolve `${release.<name>}`
  references to, for published artifacts. Default: `latest`.
