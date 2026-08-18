# Deploying to production

One-time setup on the target Ubuntu server, then `ens workflow run deploy
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
  `ens workflow run release --context production`, run wherever that
  happens for you — not part of this guide).
- An existing gateway/reverse proxy in front of this host — this deploy's
  own `caddy` container never runs in production (`compose.yaml` gates it
  behind the `dev` Compose profile, which `workflow.yml` only ever passes
  for `context.name == 'development'`); routing `server:8787` (the `/v1/*`
  API) and `web:8000` (everything else) to the outside world is handled
  separately, outside this repo.

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
`contexts/production/variables.yml` points `SERVER_WORKSPACE_PATH`
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

## 4. Provide the secrets private key

`git clone` already brought every secret this repo needs — encrypted, in
the committed `contexts/production/secrets.yml` (and, for whole files,
`contexts/production/secrets/*.enc`). The only thing it
couldn't bring is the private key that decrypts them (by design — the
key never lives in git). Copy it onto this host out of band (e.g. `scp`
from wherever it was generated with `ens init`), placing it at
`.ensemble/secrets.key` in this checkout — never commit it. That's it;
step 5 can decrypt everything from here.

If `server` (once running) will also trigger `deploy`/`release` itself —
the dashboard, a manual API trigger, or a GitHub push — register this
repo with it and hand over the same key, so its spawned `runner`
containers can decrypt too:

```sh
curl -X POST https://<your-domain>/v1/integrations/git/register \
  -H "Authorization: Bearer <a token with 'upload', from step 3>" \
  -H "Content-Type: application/json" \
  -d "{\"repoUrl\":\"https://github.com/ritajhq/ensemble.git\",\"projectName\":\"ensemble\",\"secretsKey\":\"$(cat .ensemble/secrets.key)\"}"
```

(Rotating the key later, or adding/changing an individual secret's
value, is covered in `workflows/deploy/README.md`.)

## 5. Deploy

```sh
ens workflow run deploy --context production
```

This runs `docker compose` against `workflows/deploy/compose.yaml` with the
`production` context's `.env` — starting `server` and `web` (no `caddy`,
see Prerequisites) on the `edge` network, pulling
`registry.ritaj.app/...:latest` images.

Re-run the same command for every later deploy — `docker compose up -d` is
idempotent, so it'll only recreate what actually changed (typically just
pulling newer `:latest` images and recreating the containers using them).

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
  `server`'s logs — step 2 wasn't done, or `SERVER_WORKSPACE_PATH` in
  `.env` doesn't match where you actually created it.
- **Everything else** — `docker logs ensemble-server` / `docker logs
  ensemble-web` first; both containers log to stdout.
