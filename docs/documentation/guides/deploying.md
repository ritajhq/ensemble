# Deploying

`ens deploy <name> <kit>` takes the delivery manifest at
`ci/<name>/delivery.yml`, resolves it against a deploy kit, and runs one of
four **terminations** against it. For local, iterative work, see
[Local development](local-development.md) and `ens develop` instead — this
page covers the full model behind it.

## Terminations

Exactly one of these runs per invocation (the default is `apply`):

| Flag | What it does |
|---|---|
| _(none)_ | **Apply** — bring the workload up (or reconcile it to its declared state). |
| `--eject` | Render the kit's artifact (e.g. a `compose.yaml`) to the outputs directory and stop. No apply. |
| `--plan` | Render, then show the intent-diff against the last apply/plan, and stop. |
| `--watch` | Run the kit's long-lived watch command instead of a one-shot apply, torn down on Ctrl+C. A kit/target with no watch command (e.g. `aws`) surfaces an error. |

`--eject` and `--plan` can't be combined with each other or with `--watch`.

Tearing a workload down is explicitly out of scope for the current deploy
model — there is no `destroy` command or flag.

## Resolving releases

- `--artifacts local|published` (default `published`) — whether
  `${release.<name>}` references resolve to a locally-packed image or a
  published one.
- `--version <version>` (default `latest`) — the released version to
  resolve published `${release.*}` references against.
- `--no-pack` — skip packing referenced releases before a local apply
  (ignored for published artifacts, where packing already happened at
  release time).
- `--verbose` — show a local apply's pack step's own build-tool output
  (e.g. `docker buildx build`'s progress log) instead of hiding it behind
  the pack spinner.

## Capabilities and externals

- `--accept-capability-gaps` — proceed even if the target kit can't satisfy
  a capability the manifest requests (otherwise `ens deploy` hard-fails).
  See [Capabilities and classes](../concepts/delivery-manifests.md#capabilities-and-classes).
- `--emulate-externals` — before applying, stand up a local substitute for
  each declared `external` resource the kit knows how to emulate (e.g.
  `docker network create` for an external network) instead of assuming it
  already exists elsewhere. Can't be combined with `--eject`/`--plan`.

## `explain`

```sh
ens deploy <name> <kit> explain <category.name>
```

Explains one resource's resolution: which provisioner matched (and why
others didn't), each value's provenance, any accepted capability gaps, and
the resolved outputs. `<resource>` is `category.name`, e.g.
`databases.primary`. Takes the same `--artifacts`/`--version` flags as
`deploy` itself, to control which release locator gets resolved.

## Choosing a target

Two deploy kits ship with this repo — see
[Kits](../concepts/kits.md#deploy-kits) for what each one drops:

```sh
ens deploy web compose   # docker compose — one host
ens deploy web aws       # CloudFormation — ECS + RDS in your own account
```

There is no `kubernetes` kit in this repo.

## Full reference

See the [`ens deploy` CLI reference](../reference/cli/deploy.md) for every
flag and [`ens develop`](../reference/cli/develop.md) for the local-dev
shorthand.
