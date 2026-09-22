# `ens config`

Manage `.ensemble/config.yaml` (shared, git-tracked) and
`.ensemble/config.local.yaml` (gitignored, per-developer).

## `ens config set-build-kit <app> <kit>`

Associate an app with a build kit in the shared `config.yaml`.

```sh
ens config set-build-kit web react
```

## `ens config set-build-var <app> KEY=VALUE`

Set a personal default build var for an app, stored in the gitignored
`config.local.yaml` — for things you build the same way every time
locally. Repeated calls accumulate keys rather than overwrite them.

```sh
ens config set-build-var web API_URL=http://localhost:4000
```

## `ens config set-pack-var <ship> KEY=VALUE`

Same as `set-build-var`, for pack vars.

```sh
ens config set-pack-var web TAG=dev
```
