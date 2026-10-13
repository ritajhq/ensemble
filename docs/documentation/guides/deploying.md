# Deploying

`ens deploy <name> <kit>` takes the delivery manifest at
`ci/<name>/delivery.yml`, resolves it against a deploy kit, and runs one of four
**terminations** against it. For local, iterative work, see
[Local development](local-development.md) and `ens develop` instead — this page
covers the full model behind it.

## Terminations

Exactly one of these runs per invocation (the default is `apply`):

| Flag      | What it does                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(none)_  | **Apply** — bring the workload up (or reconcile it to its declared state).                                                                                  |
| `--eject` | Render the kit's artifact (e.g. a `compose.yaml`) to the outputs directory and stop. No apply.                                                              |
| `--plan`  | Render, then show the intent-diff against the last apply/plan, and stop.                                                                                    |
| `--watch` | Run the kit's long-lived watch command instead of a one-shot apply, torn down on Ctrl+C. A kit/target with no watch command (e.g. `aws`) surfaces an error. |

`--eject` and `--plan` can't be combined with each other or with `--watch`.

## Instances and tearing down

`--instance <slug>` deploys the manifest as a named instance beside its plain
deployment — a branch's preview, say. The instance gets its own deployment name
(`<repo>-<name>--<slug>`), rendered artifact, render cache and task snapshot, so
any number of them run side by side. The slug is a DNS label. What differs
between instances (the hostname they answer on, which network alias their
gateway takes) is ordinary per-environment values the pipeline puts in the
environment — ens doesn't derive them.

```sh
ens deploy web compose --instance feat-login
ens destroy web compose --instance feat-login   # or: ens deploy … --destroy
```

`ens destroy` runs the kit's own teardown (`docker compose down --volumes` for
compose) and drops the state `ens deploy` kept for it. It needs no environment
values and no render, only that the manifest and kit exist. A kit with no native
teardown (aws) reports that instead. Externals, such as the `edge` network, are
never removed.

## Previews

A preview is an instance (`--instance <slug>`) reachable at
`<slug>.preview.<domain>`. Two parts make that work with no per-preview
registration anywhere.

**One router per host**,
[`ci/preview-router`](../../../ci/preview-router/delivery.yml): a Caddy with a
wildcard certificate (obtained through Cloudflare's DNS API, so the host needn't
be reachable from the internet) that proxies `<slug>.preview.<domain>` to
whichever gateway on the `preview` network took `<slug>` as its alias. Bring it
up once:

```sh
export CLOUDFLARE_API_TOKEN=…   # Zone → DNS → Edit on the zone, nothing broader
ens deploy preview-router compose --artifacts local --emulate-externals
```

**A previewable manifest** puts its gateway on that network under the instance's
alias and answers on the instance's hostname. Neither is derived by ens: the
pipeline exports them, as it does every per-environment value.

```yaml
deploy:
  networking:
    gateway:
      type: gateway
      networks: ${variables.ingress_networks.value}
      alias: ${variables.gateway_alias.value}
      routes:
        - host: ${variables.public_host.value}
          path: /*
          target:
            service: web
            port: ${compute.web.http}
  variables:
    ingress_networks:
      type: list
      default: edge
    gateway_alias:
      default: gateway
    public_host:
      default: app.ritaj.app
```

A preview then deploys with `ingress_networks=preview`, `gateway_alias=<slug>`
and `public_host=<slug>.preview.ritaj.app` in the environment, and the plain
deployment keeps its defaults.

### Reaching the router over WARP

The router is the one compute that opts in to `publish`: it answers on the
host's own `443`, which is how a deploy otherwise never exposes anything. The
host needs a stable address, such as a static DHCP lease, and then:

1. A DNS-only (not proxied) wildcard record `*.preview.<domain>` → the host's
   address.
2. A route for that address through the tunnel, for clients off the LAN (Zero
   Trust → Networks → Routes). Nothing is exposed publicly: the address is
   private, and the certificate is obtained through the DNS API.
3. WARP enrolled on each device that opens a preview.

Only one stack on the host can publish `443`, so this is the router's, not a
preview's.

### Deploying on push

`source/apps/preview` is a small service that turns GitHub pushes into
instances: a push to a tracked branch runs
`ens deploy <delivery> <kit>
--instance <slug> --artifacts local` in a checkout
of that branch, and deleting the branch runs `ens destroy`. Pushes that arrive
while a preview is deploying are folded into one follow-up deploy of the newest
commit.

It runs as a process on the host, not in a container: it needs the Docker
daemon, `git` and `ens`, and a containerised copy would have the checkout's
paths (init files a manifest mounts) mean something different to the daemon than
to it. Build it with `ens build preview`; the result is
`source/artifacts/preview/main.js`.

```yaml
# preview.yml
domain: preview.ritaj.app
network: preview
workspace: /var/lib/ens-previews
repositories:
  portal:
    repo: ritajhq/portal
    delivery: portal
    branches:
      - main
      - feat/*
    envFiles:
      - ci/portal/preview.env
```

A preview is `<slug>.<domain>`, where the slug is the branch name made into a
DNS label (`feat/login` becomes `feat-login-<digest>`). The deploy gets
`INGRESS_NETWORKS`, `GATEWAY_ALIAS` and `PUBLIC_HOST` — the three variables the
manifest example above reads. A repository whose manifest names them otherwise
lists `variables:` mapping its variable name to a template over `{slug}`,
`{host}`, `{network}` and `{branch}`. Everything else the manifest needs
(secrets, credentials) comes from the service's own environment and the
repository's `envFiles`.

```sh
# WEBHOOK_SECRET_<ID> is per repository id, upper-cased; GITHUB_TOKEN is
# only needed to clone a private repository.
export PREVIEW_CONFIG=/etc/ens-preview/preview.yml
export WEBHOOK_SECRET_PORTAL=…
export GITHUB_TOKEN=…
export ENS_BIN=/usr/local/bin/ens
PORT=8080 deno run -A source/artifacts/preview/main.js
```

On the repository, add a webhook to
`https://<where this is reachable>/webhook/<id>` (JSON, the same secret) for the
**push** and **delete** events. Each request is verified against that
repository's own secret, and a payload naming any other repository is refused.
`GET /` lists each preview's last outcome.

The service runs whatever a tracked branch contains on this host, with access to
its Docker daemon: track only branches whose authors you'd let deploy there.

## Resolving releases

- `--artifacts local|published` (default `published`) — whether
  `${release.<name>}` references resolve to a locally-packed image or a
  published one.
- `--version <version>` (default `latest`) — the released version to resolve
  published `${release.*}` references against.
- `--no-pack` — skip packing referenced releases before a local apply (ignored
  for published artifacts, where packing already happened at release time).
- `--verbose` — show a local apply's pack step's own build-tool output (e.g.
  `docker buildx build`'s progress log) instead of hiding it behind the pack
  spinner.

## Capabilities and externals

- `--accept-capability-gaps` — proceed even if the target kit can't satisfy a
  capability the manifest requests (otherwise `ens deploy` hard-fails). See
  [Capabilities and classes](../concepts/delivery-manifests.md#capabilities-and-classes).
- `--emulate-externals` — before applying, stand up a local substitute for each
  declared `external` resource the kit knows how to emulate (e.g.
  `docker network create` for an external network) instead of assuming it
  already exists elsewhere. Can't be combined with `--eject`/`--plan`.

## `explain`

```sh
ens deploy <name> <kit> explain <category.name>
```

Explains one resource's resolution: which provisioner matched (and why others
didn't), each value's provenance, any accepted capability gaps, and the resolved
outputs. `<resource>` is `category.name`, e.g. `databases.primary`. Takes the
same `--artifacts`/`--version` flags as `deploy` itself, to control which
release locator gets resolved.

## Choosing a target

Two deploy kits ship with this repo — see
[Kits](../concepts/kits.md#deploy-kits) for what each one drops:

```sh
ens deploy web compose   # docker compose — one host
ens deploy web aws       # CloudFormation — ECS + RDS in your own account
```

There is no `kubernetes` kit in this repo.

## Full reference

See the [`ens deploy` CLI reference](../reference/cli/deploy.md) for every flag
and [`ens develop`](../reference/cli/develop.md) for the local-dev shorthand.
