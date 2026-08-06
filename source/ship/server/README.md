1. Prepare the target project directory on the server.

It needs .ensemble/ and workflows/.

```sh
mkdir -p ~/.local/share/ensemble/.ensemble ~/.local/share/ensemble/workflows
```

1. Create `.ensemble/platform/tokens.json`

Generate one strong random token per caller (or one for everything, if
you're the only caller) and grant each the permissions it needs —
`trigger` for POST /v1/workflows/:name/trigger, `upload` for PUT
/v1/workflows/:name:

```sh
openssl rand -hex 32
```

```json
// ~/.local/share/ensemble/.ensemble/platform/tokens.json
{
  "<generated-token>": { "trigger": true, "upload": true }
}
```

Also pick a `GITHUB_WEBHOOK_SECRET` (a separate concern — it verifies
GitHub's own webhook signature, not a caller token) if you're using the
github-trigger feature:

```sh
openssl rand -hex 32
```

1. Pull/build the `runner` image too (`source/ship/runner/`) and tag it
   `runner:latest`, or whatever name you'll pass as `ENSEMBLE_RUNNER_IMAGE`
   below — `server` spawns it as a sibling container for every
   server-triggered workflow run (manual trigger, GitHub webhook, dashboard
   "run now"). A local `ens workflow <name>` run doesn't need it; only
   `server` does.

1. Find the host's `docker` group GID (`server` runs as a non-root user and
   needs group membership on the socket to spawn `runner` containers):

```sh
getent group docker | cut -d: -f3
```

1. Run the container

```sh
docker run -d \
  --name ensemble-server \
  --restart unless-stopped \
  -v ~/.local/share/ensemble:/workspace \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --group-add <docker GID from the previous step> \
  -p 127.0.0.1:8787:8787 \
  -e GITHUB_WEBHOOK_SECRET='<generated-secret>' \
  -e ENSEMBLE_RUNNER_IMAGE=runner:latest \
  -e ENSEMBLE_HOST_WORKFLOWS_PATH=~/.local/share/ensemble/workflows \
  server:latest
```

`ENSEMBLE_HOST_WORKFLOWS_PATH` must be the real path on *this host*
(wherever you're running `docker run` from) — not a path inside the
container. Docker's bind mounts for a sibling container spawned over the
socket are always resolved by the host's own daemon, which has no
visibility into what `server`'s `/workspace` mount remaps to internally.
