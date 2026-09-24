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
the workload to resolve those. The render happens before the task runs, so a
broken reference fails with the manifest's own error rather than halfway through
a migration.

- `--artifacts <local|published>` — which release locator to resolve
  `${release.<name>}` references against. Defaults to `published`, matching
  `ens deploy`.
- `--version <version>` — the released version to resolve those references to.
  Defaults to `latest`.

See [`tasks` in the manifest schema](../delivery-manifest-schema.md#tasks) for
what a task declares, and in particular the `${deployment.*}` namespace that
lets a script name the deployment's own artifact, project, and root instead of
hardcoding what `docker compose` derives.
