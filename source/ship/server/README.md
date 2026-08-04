1. Prepare the target project directory on the server.

It needs .ensemble/ and workflows/.

```sh
mkdir -p ~/.local/share/ensemble/.ensemble ~/.local/share/ensemble/workflows
```

1. Create `.ensemble/tokens.json`

Generate one strong random token per caller (or one for everything, if
you're the only caller) and grant each the permissions it needs —
`trigger` for POST /v1/workflows/:name/trigger, `upload` for PUT
/v1/workflows/:name:

```sh
openssl rand -hex 32
```

```json
// ~/.local/share/ensemble/.ensemble/tokens.json
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

1. Run the container

```sh
docker run -d \
  --name ensemble-server \
  --restart unless-stopped \
  -v ~/.local/share/ensemble:/workspace \
  -p 127.0.0.1:8787:8787 \
  -e GITHUB_WEBHOOK_SECRET='<generated-secret>' \
  server:latest
```
