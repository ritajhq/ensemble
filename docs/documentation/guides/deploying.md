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
any number of them run side by side. The slug is a DNS label. A gateway on an
ingress network answers there to that deployment name unless its manifest sets
`alias`, so instances sharing a network never answer for each other. Each deploy
records where it can be reached
(`.ensemble/deploy/<name>--<slug>/<kit>.ingress.json`: networks, alias, port and
hosts) for whatever fronts it. The hostnames an instance answers on are ordinary
per-environment values the pipeline puts in the environment — ens doesn't derive
them.

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

A preview is an instance of a manifest built from one branch, reachable at its
own hosts, and taken down when the branch is deleted. The platform
(`source/apps/platform`, deployed as
[`ci/platform`](../../../ci/platform/delivery.yml)) runs them: on each push to a
branch a manifest tracks, it checks the branch out on its own and runs
`ens deploy <manifest> <kit> --artifacts local --instance
preview-<slug>` there;
on the branch's deletion, `ens destroy` with the same instance.

Its values start from one of the manifest's environments — never production: a
preview runs whatever its branch holds, and can read every value it is given —
with the variables a browser sees set for each preview from templates:

```text
domain = {internal}
dashboard_origin = https://{host:dashboard}
```

`{internal}` is the preview's own domain (`<slug>.<project>.preview.internal`),
which only its gateway sees: route hosts under it, the same way the manifest's
environments route hosts under their real domain. Each such host is published as
one label under the preview domain — `dashboard.<internal>` as
`dashboard--<slug>--<project>.ensemble.blue`, `{internal}` itself as
`<slug>--<project>.ensemble.blue` — so one wildcard certificate covers every
preview. `{host}` and `{host:<subdomain>}` are those public hosts; `{slug}` and
`{branch}` name the branch.

The platform's router fronts every deployment it makes, previews included: it
routes each host a deployment recorded (`<kit>.ingress.json`, see
[Instances and tearing down](#instances-and-tearing-down)) to that deployment's
gateway on the `ingress` network, asking a preview's gateway for its internal
host. Bring the platform up once per host:

```sh
export PLATFORM_SECRET_KEY=$(openssl rand -base64 32)   # keep it
export GITHUB_TOKEN=…
ens deploy platform compose --artifacts local --emulate-externals
```

Each project's GitHub webhook — `https://<platform>/hooks/github/<project>`,
JSON, push and delete events — is verified with the project's own secret, set in
the platform.

Nothing the platform answers for is open to everyone. Its own UI and API are
behind an idhn guard that lets only signed-in operators through (GitHub's
webhooks aside, which verify themselves); every preview is reached only once the
previews' guard has let the request through, which signed-in operators and
previewers pass. Sign-in is the stack's own khatm, at `auth.<domain>`, whose
cookie is set on the preview domain so one sign-in covers the platform and every
preview — and is taken out of every request before it reaches a deployment.
Roles come from khatm (`khatm users set-role <user> operator|previewer`); who
holds which is the platform's base policies'
(`source/ship/platform-policies/base`).

The guards, judge, policy builder and khatm are built `FROM` the images idhn and
khatm publish (`ghcr.io/ritajhq/…`). To build from another registry or a pinned
version, give the ship a pack var — `source/envs/pack/<ship>.env`, read by every
pack and passed to the Dockerfile as a build argument:

```sh
# source/envs/pack/platform-guard.env
GUARD_IMAGE=registry.example.com/idhn/guard-standalone:0.3.1
```

A preview runs whatever its branch holds, on the same Docker host as the
platform: track only branches whose authors you'd let deploy there.

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
