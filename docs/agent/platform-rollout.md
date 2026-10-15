# Handoff: rolling out the ensemble platform

You are a Claude Code session asked to bring the **ensemble platform** live on
this server. The platform (`source/apps/platform`, deployed as
[`ci/platform`](../../ci/platform/delivery.yml)) releases and deploys ensemble
projects from a web UI, runs branch previews, and fronts every deployment with
one router. It was built and tested on a developer machine; nothing of it runs
anywhere yet. This file is everything you need to finish the job: what must
happen, in which order, what to check, and where to stop and ask.

**Steps 1–3 are done** (2026-10-15, on the developer's machine): ensemble
0.51.0, idhn 0.0.1 and khatm 0.0.1 are released, and the images the platform
builds `FROM` are on ghcr.io. [What was released](#done-releases-and-kit-sync)
records the outcome; **start at [step 4](#4-deploy-the-platform-stack)**.

Read [orientation.md](orientation.md) first if `ens` is new to you, and the
"Previews" section of
[the deploying guide](../documentation/guides/deploying.md#previews) for how the
platform works.

## Ground rules

- **Ask before anything outward-facing or irreversible**: a release (it tags,
  pushes and publishes), a `git push`, a change to the Cloudflare tunnel, a
  `docker login`. Say what you're about to do and wait for a yes.
- **Never regenerate `PLATFORM_SECRET_KEY`** once the platform has stored
  anything: every secret it holds is sealed with it, and opens with no other.
- **Never run `ens destroy platform compose` on the live stack**: it is
  `docker compose down --volumes`, and deletes the platform's database (every
  project, environment value and secret) and every account. To roll back, deploy
  the previous version instead.
- **Never invent or store a password for a person.** Hand the person the command
  and let them type it.
- **Stop and ask** when a credential below is missing, or a check fails in a way
  this file doesn't explain. Report the exact output.

## What has to be true first

Before anything else, check that the releases below are on the remote
(`git fetch --tags && git ls-remote origin refs/tags/<tag>`). If any is missing,
stop: the developer has to push first.

| Repository         | Tag      | Points at                                                  |
| ------------------ | -------- | ---------------------------------------------------------- |
| `ritajhq/ensemble` | `0.51.0` | `b2be829` (the changelog commit `08b166e` follows on main) |
| `ritajhq/idhn`     | `0.0.1`  | `bb3893c`                                                  |
| `ritajhq/khatm`    | `0.0.1`  | `3dbf5f0`                                                  |

Then, on this server:

- `ens version` prints `0.51.0`. If not, install it:
  `curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh`.
- `docker login ghcr.io` works with **read** access to the `ritajhq` packages.
  The four base images are **private** (the developer chose to keep them so),
  and the platform's ships are built `FROM` them: without a login, step 4 fails
  pulling `ghcr.io/ritajhq/idhn/guard-standalone` and the rest. Check with
  `docker pull ghcr.io/ritajhq/idhn/guard-standalone:0.0.1`. If it's denied,
  **ask** the person to log in. A token with `read:packages` is enough: either
  `gh auth refresh -s read:packages` and then
  `gh auth token | docker login ghcr.io -u <user> --password-stdin`, or a
  classic personal access token. Fine-grained tokens don't work with ghcr.io,
  and their "Organization private registries" permission is unrelated (it's for
  Dependabot).

The rest of this file calls the directory holding the clones `$WORK` (for
example `~/ritaj`), with `ensemble` in it. Clone it if it's missing; step 4 is
the only one that needs a checkout here.

## The order

```text
1. release ensemble 0.51.0        ─┐                                   done
2. sync kits to idhn/khatm/portal  ├ on the developer's machine         done
3. release idhn and khatm         ─┘                                   done
4. deploy the platform stack on the server                             ← start here
5. point the tunnel at its router
6. give the first operator a password
7. verify
```

## Done: releases and kit sync

For reference only; don't redo any of it.

- **ensemble 0.51.0**: `@ensemble/core`, `@ensemble/host` and
  `@ensemble/kit-sdk` 0.51.0 on JSR, the CLI binary as a GitHub release, and the
  VS Code extension on the Marketplace. The platform's own images were built
  from the idhn/khatm bases packed locally, through temporary pack vars in
  `.ensemble/config.local.yaml`. That file has since been deleted, so the
  platform ships build from the ghcr.io images again.
- **Kit sync**: ensemble's `pack/docker` and `deploy/compose` kits copied into
  idhn (`bb3893c`), khatm (`3dbf5f0`) and portal (`92e8c9d`, not pushed yet:
  portal isn't needed for this rollout).
- **idhn 0.0.1 and khatm 0.0.1**: four images on ghcr.io, each tagged `0.0.1`
  and `latest`, all **private**:
  `ghcr.io/ritajhq/idhn/{guard-standalone,judge-server,policy-builder}` and
  `ghcr.io/ritajhq/khatm/khatm`.

Two problems came up during the 0.51.0 release. Both are fixed, but they explain
commits you'll see in the history:

- The version bump moved the core libraries to 0.51.0 but left other workspace
  members pinning `^0.50.0`. On 0.x, `^0.50.0` excludes 0.51.0, so Deno silently
  resolved the old JSR release instead of the workspace copy. The platform
  server failed to bundle (`No matching export ... IngressFile`), and the kits
  failed their authorize step (`authorizePublish is not a function`). Fixed for
  this release by `8f67d2a` (apps and unpublished libs import `@ensemble/core`
  unversioned) and `b2be829` (kits pinned to `^0.51.0`). From the next release
  on, `0f2bfd7` makes the release stamp repin every workspace member's versioned
  core-lib imports itself.
- The ensemble release ran with the CLI from source
  (`deno run -A source/apps/cli/main.ts`), because the installed `ens` was still
  0.50.0 and lacked the authorize step. On this server, use the installed
  0.51.0.

## 4. Deploy the platform stack

On the server, in an up-to-date `$WORK/ensemble` checkout. The stack builds its
own images from this checkout (`--artifacts local`).

**The checkout directory must be named `ensemble`**: the stack's containers are
named `<directory>-platform-<service>-1`, and the router is configured with
those names. If it isn't, set `STACK=<directory>-platform` in the env file
below.

1. Make the platform's env file — once, as the user that runs `docker` and `ens`
   here. Ask the person for `GITHUB_TOKEN` (a token that can clone the projects
   the platform will manage, and push to those it will release):

   ```sh
   install -d -m 700 ~/.config/ens-platform
   (umask 077; cat > ~/.config/ens-platform/platform.env) <<EOF
   PLATFORM_SECRET_KEY=$(openssl rand -base64 32)
   AUTH_SECRET=$(openssl rand -base64 32)
   GITHUB_TOKEN=<from the person>
   # Hosts, if not ensemble.blue's (see ci/platform/delivery.yml's variables):
   # PLATFORM_HOST=platform.ensemble.blue
   # AUTH_HOST=auth.ensemble.blue
   # PREVIEW_DOMAIN=ensemble.blue
   # ADMIN_EMAIL=operator@ensemble.blue
   EOF
   ```

   If `~/.config/ens-platform/platform.env` exists already, **keep it as it
   is.** Tell the person to back it up somewhere safe: losing
   `PLATFORM_SECRET_KEY` loses every secret the platform holds.

2. Deploy. `--emulate-externals` creates the `ingress` and `platform` networks
   the first time:

   ```sh
   cd $WORK/ensemble
   ens deploy platform compose --artifacts local --emulate-externals \
     --env-file ~/.config/ens-platform/platform.env
   ```

   Later redeploys are the same command without `--emulate-externals`. If a
   build fails pulling `ghcr.io/ritajhq/...` (`denied` or `unauthorized`), the
   ghcr.io login from [What has to be true first](#what-has-to-be-true-first) is
   missing.

3. Check every container is up and started cleanly:

   ```sh
   docker ps --filter name=ensemble-platform --format '{{.Names}} {{.Status}}'
   for c in platform router guard guard-previews judge policies auth; do
     echo "== $c"; docker logs ensemble-platform-$c-1 2>&1 | tail -3
   done
   ```

   Seven containers. The guards log `guard.started`, the builder
   `builder.started`, khatm `apply.started`, the router
   `watching config
   file for changes`.

## 5. Point the tunnel at the router

The router answers plain HTTP on the `ingress` network as
`ensemble-platform-router-1:80`; TLS ends at Cloudflare. **Ask the person** how
their tunnel runs (a `cloudflared` container, a host service, the Zero Trust
dashboard) before touching it. It must send these hostnames to the router — and
**nothing else on `ingress` may be called `router`**, so use the container name,
not the service name:

- the platform host (`platform.ensemble.blue`),
- the sign-in host (`auth.ensemble.blue`),
- every preview: `*.ensemble.blue`.

A `cloudflared` container has to join the `ingress` network to reach it
(`docker network connect ingress <cloudflared container>`). Cloudflare's free
certificate covers `*.ensemble.blue`, which is one label deep — exactly what
preview hosts are.

## 6. The first operator

khatm created the operator account (`ADMIN_EMAIL`, `operator@ensemble.blue` by
default) on its first start, without a password. Give the person these lines to
run themselves — the password is read without echoing, and handed to khatm on
its standard input:

```sh
read -rs -p 'Password: ' P; echo
printf '%s' "$P" | docker exec -i ensemble-platform-auth-1 khatm users set-password operator@ensemble.blue
unset P
```

Other people sign up at `https://auth.ensemble.blue/signup`, and an operator
gives them a role: `operator` (runs the platform) or `previewer` (may visit
previews):

```sh
docker exec ensemble-platform-auth-1 khatm users set-role <email> previewer
```

## 7. Verify

From inside the `ingress` network, as the tunnel sees it:

```sh
r() { docker run --rm --network ingress curlimages/curl:8.11.1 -s -o /dev/null -w '%{http_code}\n' "$@"; }
r -H 'Host: platform.ensemble.blue' http://ensemble-platform-router-1/              # 401: signed out
r -H 'Host: platform.ensemble.blue' http://ensemble-platform-router-1/api/projects  # 401
r -X POST -H 'Host: platform.ensemble.blue' http://ensemble-platform-router-1/hooks/github/none   # 404: webhooks pass the guard
r -H 'Host: auth.ensemble.blue' http://ensemble-platform-router-1/login              # 200
r -H 'Host: nothing.example.com' http://ensemble-platform-router-1/                  # 404
r http://ensemble-platform-platform-1:8090/                                          # 000: unreachable from ingress
```

Then, once the tunnel is up, the person opens `https://platform.ensemble.blue`,
signs in through the link on the page, and sees the platform. A first useful
check: add `ritajhq/ensemble` as a project and watch it sync.

## Report back

Tell the person, in a few lines: which steps ran, the ensemble commit the server
deployed from, any commits made and whether they were pushed, where the env file
is (`~/.config/ens-platform/platform.env`, and that it needs backing up), what
the tunnel now routes, and anything you skipped or that failed, with its output.

## Known gaps (not yours to fix now)

- Redeploying the platform _from_ the platform kills its own run halfway:
  redeploy it from a shell, as in step 4.
- Kit credentials (AWS keys, a remote Docker host) have nowhere to live in the
  platform yet; only compose on this host's Docker works.
- A deploy reads the manifest at the branch's tip, not at the version deployed.
- A preview runs whatever its branch holds on this Docker host: track only
  branches whose authors you'd let deploy here.
