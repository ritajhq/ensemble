# deploy

Deploys ensemble's own `server` + `web` — the dogfooded CI platform itself,
not a separate product — via Terraform and the `ritajhq/dockercompose`
provider (manages a Docker Compose stack as one Terraform resource; see
https://registry.terraform.io/providers/ritajhq/dockercompose).

## Preconditions on the target host

- **An external `edge` Docker network already exists** (`docker network
  create edge`, once, out of band). `main.tf` declares it `external = true`
  and never tries to create it — true both in production (where Caddy
  already runs on the host, outside this stack, terminating TLS) and
  locally (where the `caddy` service below stands in for it).
- **In production**, Caddy is assumed already running on the host,
  reverse-proxying into `server`/`web` over the `edge` network. This
  workflow doesn't provision it.
- **Locally** (`--context development`, `enable_watch = true`), this
  stack runs its own `caddy` service instead — a plain HTTP mock of that
  same `server`/`web` routing (see `Caddyfile`), gated behind the `dev`
  Docker Compose profile so it only ever runs during local development,
  never in production. `main.tf` sets `active_profiles = ["dev"]`
  whenever `enable_watch` is true, which is what turns it on.
- **Terraform state is local** (`backend.tf` configures no remote backend)
  — `workflows/deploy/terraform/terraform.tfstate` lives on whatever host
  actually runs `terraform apply`, so re-running this workflow from a
  different host without that state file would try to recreate the stack
  from scratch. Fine for now (this deploys from one designated host per
  environment); revisit if that stops being true.

## Contexts

`development` and `production` — see each context's
`variables/TF_VARS.json` for what's genuinely stable-per-environment
config (resolved via `${{ contextFile('TF_VARS.json') }}` — see
`@ensemble/workflow`'s README for how `context:` loaders work), and
`terraform/variables.tf` for the handful of things that are NOT (host
facts like the docker GID, computed at run time by `workflow.yml` itself
instead).

**Secrets**: `server_github_webhook_secret` is never in a committed file
— it's declared under `workflow.yml`'s `context.secrets` and loaded from
a gitignored `contexts/<name>/secrets.env`, hand-provisioned once on the
actual deploy host:

```
GITHUB_WEBHOOK_SECRET=<a real secret>
```

`terraform_apply` fails with a clear message if that value can't be
resolved, rather than silently deploying with no secret. See
`variables.tf`'s `server_github_webhook_secret` doc comment for why this
is a stopgap — a real separately-versioned secrets loader (`--context-source
vault`, see `@ensemble/workflow`'s README) is the natural next step once
one exists.

## Running it

```sh
ens workflow deploy --context development
ens workflow deploy --context production
```

Locally, once up, the `caddy` service listens on `localhost:8999` —
the same `server`/`web` routing split production's real Caddy would do,
just unencrypted and only for `--context development`.
