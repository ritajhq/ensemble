# `ens destroy`

Take a deployed workload down using the given deploy kit, and drop the state
`ens deploy` kept for it (rendered artifact, render cache, task snapshot).

```sh
ens destroy <name> [kit]
```

- `<name>` — the workload's name, matching `ci/<name>/delivery.yml`.
- `[kit]` — the deploy kit to use (e.g. `compose`). Optional when
  `deploy.<name>.kit` in `.ensemble/config.yaml` names one, as for
  [`ens deploy`](deploy.md).

## Flags

- `--instance <slug>` — destroy this named instance (see
  `ens deploy --instance`) rather than the plain deployment.

```sh
ens destroy web compose
ens destroy web compose --instance feat-login
```

Needs no environment values and no render. Fails for a kit that has no native
teardown (aws). `ens deploy <name> <kit> --destroy` is the same operation.
