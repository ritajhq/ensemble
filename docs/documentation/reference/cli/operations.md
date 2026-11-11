# `ens operations` and `ens operation`

Operations are the one-off steps a workload declares under `operations:` in
`ci/<name>/delivery.yml`: a migration, trusting a dev CA, a break-glass command.
They are run by hand, never by a deploy. `ens ops` and `ens op` are aliases.

```sh
ens operations <name> [-k <kit>]
ens operation <name> <operation> [args...] [-k <kit>]
```

## `ens operations`

Lists the operations declared under `operations:` in `ci/<name>/delivery.yml`, one per
line: the operation's name, a tab, then its `description` (empty when it declares
none). It takes the same `--env-file` as `operation`, since the manifest is checked
against the environment.

```sh
ens operations portal
```

## `ens operation`

Runs one of the operations declared under `operations:` in `ci/<name>/delivery.yml`:

```sh
ens operation portal auth-migrate
ens operation portal trust-gateway-ca --force
```

`--instance <slug>` runs the operation against that named instance of the workload
(see [`ens deploy --instance`](deploy.md)): `${deployment.name}` and
`${deployment.artifact}` name the instance's own deployment, and the snapshot
below is the one that instance's deploy left.

Trailing arguments are handed to the operation as `$1..$n`. An operation that exits
non-zero makes this command exit non-zero too — that invocation failed; no
deploy started, so there is nothing to roll back.

The kit is `-k <kit>`, else the one `deploy.<name>.kit` in
`.ensemble/config.yaml` names (as for `ens deploy`). An operation's `script` is read from its folder,
`ci/<name>/<kit>/operations/`, so the same operation can do its step differently on each
platform. An operation needs the kit also because its `arguments` may reference
anything a resource field may (`${databases.database.host}`,
`${compute.web.http}`), and only a kit can render the workload to resolve those.

### Where argument values come from

An operation acts on what is deployed, so it first looks for what the last deploy left
for it. Every `ens deploy` that applies (or starts a watch session, as
`ens develop` does) keeps each operation argument only a render can answer — a
provisioner's output, a port, a release — in
`.ensemble/deploy/<name>/<kit>.operations.json`, gitignored like the render cache
next to it. The rest are resolved when the operation runs, as always: literals,
`${variables.*}` (from the environment and the env files, so no variable — and
no secret — is ever written there), `${external.*}`, and
`${deployment.name}`/`${deployment.root}`. With that file, an operation runs without
loading the kit at all.

An argument may also embed references in a larger string, as a resource field
may
(`AUTH_BASE_URL: https://auth.${variables.domain.value}${variables.origin_port.value}`).
Embedded references the file doesn't need are interpolated when the operation runs.
One that only a render can answer is never written to the file, since the string
may embed a variable holding a secret, so an operation with one always renders.

It is used only while it still describes the deployment: if
`ci/<name>/delivery.yml`, the kit, or `ci/<name>/<kit>.config.yml` has changed
since that deploy (or the operation gained an argument the deploy couldn't know
about), the command says so and resolves the arguments by rendering instead.
That render covers only the resources the operation's arguments reference and what
those depend on — unless it references `${deployment.artifact}`, which names the
file a render of the whole workload is presented as. The render happens before
the operation runs, so a broken reference fails with the manifest's own error rather
than halfway through a migration.

- `--artifacts <local|published>` — which release locator to resolve
  `${release.<name>}` references against when rendering. Defaults to
  `published`, matching `ens deploy`. The last deploy's values are used whatever
  this says: they are what's running.
- `--version <version>` — the released version to resolve those references to
  when rendering. Defaults to `latest`.
- `--env-file <path>` — load an env file (repo-root relative or absolute,
  repeatable) as values beneath the process environment. None by default: a real
  environment's pipeline exports every value itself.

See [`operations` in the manifest schema](../delivery-manifest-schema.md#operations) for
what an operation declares, and in particular the `${deployment.*}` namespace that
lets a script name the deployment's own artifact, project, and root instead of
hardcoding what `docker compose` derives.
