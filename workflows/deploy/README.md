# deploy

Deploys ensemble's own `server` + `web` — the dogfooded CI platform itself,
not a separate product — via Terraform and the `ritajhq/dockercompose`
provider (manages a Docker Compose stack as one Terraform resource; see
https://registry.terraform.io/providers/ritajhq/dockercompose).

## Preconditions on the target host

- **Caddy already running**, terminating TLS and reverse-proxying into
  `server`/`web`. This workflow doesn't provision it.
- **An external `edge` Docker network already exists**, shared by Caddy and
  this stack (`docker network create edge`, once, out of band). `main.tf`
  declares it `external = true` and never tries to create it.
- **Terraform state is local** (`backend.tf` configures no remote backend)
  — `workflows/deploy/terraform/terraform.tfstate` lives on whatever host
  actually runs `terraform apply`, so re-running this workflow from a
  different host without that state file would try to recreate the stack
  from scratch. Fine for now (this deploys from one designated host per
  environment); revisit if that stops being true.
- **`server_docker_gid`'s `group_add` support** depends on a
  `ritajhq/dockercompose` provider version past `v0.1.0` — not yet
  released as of this writing. `terraform validate` will reject
  `main.tf`'s `group_add` argument against the currently-published
  provider; this is expected until the provider catches up, not a bug in
  this workflow.

## Contexts

`development` and `production` — see each context's
`terraform.tfvars.json` for what's genuinely stable-per-environment
config, and `terraform/variables.tf` for the handful of things that are
NOT (host facts like the docker GID, computed at run time by
`workflow.yml` itself instead).

**Secrets**: `server_github_webhook_secret` is never in a committed
`terraform.tfvars.json` — it's loaded from a gitignored
`contexts/<name>/terraform.secrets.tfvars.json`, hand-provisioned once on
the actual deploy host:

```json
{ "server_github_webhook_secret": "<a real secret>" }
```

`terraform_apply` fails with a clear message if that file is missing,
rather than silently deploying with no secret. See `variables.tf`'s
`server_github_webhook_secret` doc comment for why this is a stopgap — a
real separately-versioned secrets repo (via `contexts:`'s `remote:`,
see `@ensemble/workflow`'s README) is the natural next step once one
exists.

## Running it

```sh
ens workflow deploy --context development
ens workflow deploy --context production
```
