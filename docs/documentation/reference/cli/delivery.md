# `ens delivery`

Commands that act on an already-deployed delivery, as declared by the workload's
manifest.

```sh
ens delivery task <name> <kit> [task] [args...]
```

## `ens delivery task`

Runs one of the tasks declared under `tasks:` in `ci/<name>/delivery.yml`. With
no task named, it lists the ones the workload declares instead of running
anything:

```sh
ens delivery task portal compose                 # list
ens delivery task portal compose auth-migrate    # run
ens delivery task portal compose trust-gateway-ca --force
```

Trailing arguments are handed to the task as `$1..$n`. A task that exits
non-zero makes this command exit non-zero too — that invocation failed; no
deploy started, so there is nothing to roll back.

The kit is required, and not just for symmetry with `ens deploy`: a task's
`arguments` may reference anything a resource field may
(`${databases.database.host}`, `${compute.web.http}`), and only a kit can render
the workload to resolve those.

### Where argument values come from

A task acts on what is deployed, so it first looks for what the last deploy
left for it. Every `ens deploy` that applies (or starts a watch session, as
`ens develop` does) keeps each task argument only a render can answer — a
provisioner's output, a port, a release — in
`.ensemble/deploy/<name>/<kit>.tasks.json`, gitignored like the render cache
next to it. The rest are resolved when the task runs, as always: literals,
`${variables.*}` (from the environment and any `--env-file`, so no
variable — and no secret — is ever written there), `${external.*}`, and
`${deployment.name}`/`${deployment.root}`. With that file, a task runs without
loading the kit at all.

An argument may also embed references in a larger string, as a resource field
may (`AUTH_BASE_URL: https://auth.${variables.domain.value}${variables.origin_port.value}`).
Embedded references the file doesn't need are interpolated when the task runs.
One that only a render can answer is never written to the file, since the
string may embed a variable holding a secret, so a task with one always
renders.

It is used only while it still describes the deployment: if
`ci/<name>/delivery.yml`, the kit, or `ci/<name>/<kit>.config.yml` has changed
since that deploy (or the task gained an argument the deploy couldn't know
about), the command says so and resolves the arguments by rendering instead.
That render covers only the resources the task's arguments reference and what
those depend on — unless it references `${deployment.artifact}`, which names the
file a render of the whole workload is presented as. The render happens before
the task runs, so a broken reference fails with the manifest's own error rather
than halfway through a migration.

- `--artifacts <local|published>` — which release locator to resolve
  `${release.<name>}` references against when rendering. Defaults to
  `published`, matching `ens deploy`. The last deploy's values are used whatever
  this says: they are what's running.
- `--version <version>` — the released version to resolve those references to
  when rendering. Defaults to `latest`.
- `--env-file <path>` — load an env file (repo-root relative or absolute, repeatable) as
  values beneath the process environment. None by default: a real
  environment's pipeline exports every value itself.

See [`tasks` in the manifest schema](../delivery-manifest-schema.md#tasks) for
what a task declares, and in particular the `${deployment.*}` namespace that
lets a script name the deployment's own artifact, project, and root instead of
hardcoding what `docker compose` derives.
