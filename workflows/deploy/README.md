# deploy

Deploys ensemble's own `server` + `web` — the dogfooded CI platform itself,
not a separate product — via a single `compose.yaml` shared by every
context, driven with plain `docker compose`. There's no infra layer between
`workflow.yml` and Docker: the same file runs `development` and
`production`, differing only in the `context.variables` values resolved for
each and whether the `dev` profile/`--watch` are turned on.

## Preconditions on the target host

- **An external `edge` Docker network already exists** (`docker network
  create edge`, once, out of band). `compose.yaml` declares it `external:
  true` and never tries to create it — true both in production (where Caddy
  already runs on the host, outside this stack, terminating TLS) and
  locally (where the `caddy` service below stands in for it).
- **In production**, Caddy is assumed already running on the host,
  reverse-proxying into `server`/`web` over the `edge` network. This
  workflow doesn't provision it.
- **Locally** (`--context development`), this stack also runs its own
  `caddy` service — a plain HTTP mock of that same `server`/`web` routing
  (see `Caddyfile`), gated behind the `dev` Compose profile
  (`--profile dev`, only passed by `workflow.yml`'s watch-mode step) so it
  only ever runs during local development, never in production.

## Contexts

`development` and `production` — `workflow.yml` declares one
`context.variables` entry per stable-per-environment value (image
registry/tag, runner image, workspace paths, web live-reload/API endpoint),
each backed by that context's own `contexts/<name>/variables.env`
(`KEY=value` per line — see `@ensemble/workflow`'s README for how
`context.variables` resolution works). Every declared variable is already a
plain env var (`$IMAGE_REGISTRY`, `$IMAGE_TAG`, ...) in every step's shell,
so `docker compose` picks them up straight from its own invoking process —
no `--env-file` needed for those.

A handful of values are host facts or secrets instead, and are resolved by
`workflow.yml`'s `deploy` job itself at run time into a generated,
uncommitted env file merged in via `--env-file` (later `--env-file` wins on
overlapping keys, though there's only ever one here): the docker group GID,
the resolved absolute `SERVER_HOST_WORKFLOWS_PATH`, `GITHUB_WEBHOOK_SECRET`,
and (watch mode only) `CADDY_CONFIG` plus the live artifact paths.
`development` additionally declares a `context.files` entry for its
`Caddyfile` (`context.files.caddy_config.path`) — `production` doesn't need
one at all, since `caddy` never starts there (no `dev` profile) and that
step (the only place `caddy_config` is referenced) never runs for it.

**Secrets**: `GITHUB_WEBHOOK_SECRET` is declared under `workflow.yml`'s
`context.secrets.variables` and stored encrypted, values-only, in
`contexts/<name>/secrets.enc` (keys stay cleartext for readable diffs —
see `@ensemble/workflow`'s README). Set or change it with:

```sh
ens workflow secrets edit deploy <context>
```

The `deploy` job's `context.secrets` declaration fails the run with a clear
message if that value can't be resolved, rather than silently deploying
with no secret.

Rotating the repo's keypair itself (rather than just a secret's value) is
`ens workflow secrets init --force`, followed by re-running `secrets edit`
for every existing secret — the old ciphertext becomes permanently
undecryptable once the keypair changes. Any server with this repo
registered as a git integration also needs the new private key handed to
it again (`POST /v1/integrations/git/repositories/<projectName>/secrets-key`).

## Running it

```sh
ens workflow run deploy --context development
ens workflow run deploy --context production
```

Locally, once up, the `caddy` service listens on `localhost:8999` —
the same `server`/`web` routing split production's real Caddy would do,
just unencrypted and only for `--context development`.
