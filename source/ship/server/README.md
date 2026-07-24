1. Prepare the target project directory on the server.

It needs .ensemble/ and workflows/.

```sh
mkdir -p ~/.local/share/ensemble/.ensemble ~/.local/share/ensemble/workflows
```

1. Pick your secrets
Three independent tokens/secrets, generate strong random values for each:

```sh
openssl rand -hex 32   # run 3 times, one for each below
```

`ENSEMBLE_HTTP_TRIGGER_TOKEN` — required to call POST /workflows/:name/trigger
`ENSEMBLE_WORKFLOW_REGISTRY_TOKEN` — required to call PUT /workflows/:name (upload)
`GITHUB_WEBHOOK_SECRET` — must match what you configure in GitHub's webhook settings later

1. Run the container

```sh
docker run -d \
  --name ensemble-server \
  --restart unless-stopped \
  -v ~/.local/share/ensemble:/workspace \
  -p 127.0.0.1:8787:8787 \
  -e ENSEMBLE_HTTP_TRIGGER_TOKEN='<generated-token-1>' \
  -e ENSEMBLE_WORKFLOW_REGISTRY_TOKEN='<generated-token-2>' \
  -e GITHUB_WEBHOOK_SECRET='<generated-token-3>' \
  server:latest
```
