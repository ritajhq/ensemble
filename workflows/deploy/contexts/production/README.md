# Deploying to production

One-time setup on the target Ubuntu server, then `ens workflow deploy
--context production` for every deploy after that.

## Prerequisites

- Docker installed, and the user running `ens` is in the `docker` group
  (`sudo usermod -aG docker $USER`, then re-login) — `server` needs the
  bind-mounted socket to spawn `runner` containers, and the deploy itself
  needs `docker compose`.
- The `ensemble` network exists: `docker network create edge` (external —
  this deploy attaches to it, doesn't create it, so other services can
  share it).
- `registry.ritaj.app/ensemble/{server,web,runner}:latest` and
  `registry.ritaj.app/hot-server:latest` are already published (via
  `ens workflow release --context production`, run wherever that happens
  for you — not part of this guide).
- An existing gateway/reverse proxy in front of this host — this deploy's
  own `caddy` container never runs in production (see
  `contexts/production/variables/Caddyfile`'s comment); routing
  `server:8787` (the `/v1/*` API) and `web:8000` (everything else) to the
  outside world is handled separately, outside this repo.

## 1. Clone the repo

```sh
git clone https://github.com/ritajhq/ensemble.git
cd ensemble
```

## 2. Prepare server's persistent workspace

`server` (the long-lived container this deploy stands up) needs its own
`.ensemble/` + `workflows/` directory on the host — this is **separate**
from the `ensemble` repo checkout above, and persists across redeploys
(it's where registered workflows, run history, and auth tokens live).
`contexts/production/variables/tfvars.json` points `server_workspace_path`
at `/srv/ensemble/server-workspace` — adjust both if you want a different
location.

```sh
sudo mkdir -p /srv/ensemble/server-workspace/.ensemble/platform
sudo mkdir -p /srv/ensemble/server-workspace/workflows
sudo chown -R "$USER" /srv/ensemble/server-workspace
```

## 3. Create auth tokens

`server`'s dashboard/API needs at least one bearer token to do anything
past a blank "unauthorized" response. Generate one per caller (or one
shared token if you're the only caller):

```sh
openssl rand -hex 32
```

```json
// /srv/ensemble/server-workspace/.ensemble/platform/tokens.json
{
  "<paste the generated token here>": { "trigger": true, "upload": true, "read": true }
}
```

## 4. Provide the GitHub webhook secret

Only needed if you'll use the `github`-trigger feature (verifying inbound
GitHub webhook signatures — unrelated to the tokens above). Generate one:

```sh
openssl rand -hex 32
```

Then create `contexts/production/secrets.env` **inside this checkout**
(gitignored — never committed, hand-provisioned per host, same as this
file always works):

```sh
echo "GITHUB_WEBHOOK_SECRET=<paste the generated secret here>" \
  > workflows/deploy/contexts/production/secrets.env
```

## 5. Deploy

```sh
ens workflow deploy --context production
```

This installs Terraform into `/tmp` if it isn't already there, then applies
`workflows/deploy/terraform/` against the `production` context's
`tfvars.json` — starting `server` and `web` (no `caddy`, see
Prerequisites) on the `edge` network, pulling
`registry.ritaj.app/...:latest` images.

Re-run the same command for every later deploy — it's the same Terraform
state, so it'll only apply what actually changed (typically just pulling
newer `:latest` images and recreating the containers using them).

## Verifying it worked

```sh
docker ps --filter "name=ensemble-"
```

Should show `ensemble-server` and `ensemble-web` both `Up`. Then, from
wherever your gateway routes to this host:

```sh
curl -H "Authorization: Bearer <your token from step 3>" \
  https://<your-domain>/v1/workflows
```

should return `{"workflows":[]}` (empty until you register/create some).

## Troubleshooting

- **"Could not find repository root (no .ensemble directory found...)"** in
  `server`'s logs — step 2 wasn't done, or `server_workspace_path` in
  `tfvars.json` doesn't match where you actually created it.
- **`terraform plan`/`apply` reports "No changes" but containers are
  visibly down/unhealthy** — make sure you're on
  `terraform-provider-dockercompose` v0.2.2 or later (`terraform init
  -upgrade` inside `workflows/deploy/terraform/` if unsure); earlier
  versions don't detect a partially-crashed stack correctly.
- **Everything else** — `docker logs ensemble-server` / `docker logs
  ensemble-web` first; both containers log to stdout.
