# Handoff: rolling out the ensemble platform

You are a Claude Code session asked to bring the **ensemble platform** live on
this server. The platform (`source/apps/platform`, deployed as
[`ci/platform`](../../ci/platform/delivery.yml)) releases and deploys ensemble
projects from a web UI, runs branch previews, and fronts every deployment with
one router. It was built and tested on a developer machine; nothing of it runs
anywhere yet. This file is everything you need to finish the job: what must
happen, in which order, what to check, and where to stop and ask.

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

These commits were made on the developer's machine. Before anything else, check
that each repository's `origin/main` contains them
(`git fetch && git
branch -r --contains <sha>`). If any is missing, stop: the
developer has to push first.

| Repository         | Commits (newest first)                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ritajhq/ensemble` | `be65ee4`, `bab2e03`, `da8b5e7`, `ac42209`, `c5863c2`, `d3e2b51`, `f2dee92`, `62bbcb9`, `8d1c5d4`, `aaacf1c`, `751794f` (and the ones between) |
| `ritajhq/idhn`     | `8b8b055`, `65e7648`                                                                                                                           |
| `ritajhq/khatm`    | `801068e`, `0be140a`                                                                                                                           |

The rest of this file calls the directory holding the clones `$WORK` (for
example `~/ritaj`), with `ensemble`, `idhn`, `khatm` and `portal` beside each
other in it. Clone whichever is missing.

## The order, and why

```text
1. release ensemble 0.51.0      ─┐ the kits' authorize step and the ingress
                                  │ record live in kit-sdk 0.51.0
2. sync kits to idhn/khatm/portal ┘
3. release idhn and khatm       ── publishes the guard, judge, builder and
                                   khatm images the platform builds FROM
4. deploy the platform stack on the server
5. point the tunnel at its router
6. give the first operator a password
7. verify
```

There is one knot: step 1 packs every ship in the repository, including the
platform's own images, which are built `FROM` images that only exist after
step 3. Step 1 untangles it by building those few from base images packed
locally.

## 1. Release ensemble 0.51.0

**Needs** (on whichever machine runs it — this server, or the developer's):

- `.ensemble/release/secrets.env` with `JSR_TOKEN` (a **full-access** JSR token:
  a publish-only one is refused by the authorize step) and `VSCE_PAT`;
- `gh auth status` logged in with write access to `ritajhq/ensemble` (the CLI
  binary is published as a GitHub release);
- `docker`, `git`, `deno`, and `git-cliff` (the changelog hook).

If any is missing here, stop and ask whether the developer would rather run this
step on their own machine; then continue from step 2 once 0.51.0 is out.

1. Pack the base images from the sibling repositories, with ensemble's own CLI
   from source:

   ```sh
   ENS="deno run -A $WORK/ensemble/source/apps/cli/main.ts"
   (cd $WORK/idhn  && for s in guard/standalone judge/server policy/builder; do $ENS pack $s docker; done)
   (cd $WORK/khatm && $ENS pack khatm docker)
   ```

2. Point the platform's ships at those local images. These go in the gitignored
   `.ensemble/config.local.yaml`, so they never reach a commit:

   ```sh
   cd $WORK/ensemble
   $ENS config set-pack-var platform-guard GUARD_IMAGE=guard/standalone:latest
   $ENS config set-pack-var platform-preview-guard GUARD_IMAGE=guard/standalone:latest
   $ENS config set-pack-var platform-judge JUDGE_IMAGE=judge/server:latest
   $ENS config set-pack-var platform-policies BUILDER_IMAGE=policy/builder:latest
   $ENS config set-pack-var platform-auth KHATM_IMAGE=khatm:latest
   ```

3. Dry-run, and read what it says. It must list the publishes (CLI, VS Code
   extension, the core libraries to JSR) and **must not** say "Would be
   refused":

   ```sh
   $ENS release next minor --dry-run
   ```

   Confirm the version it would create is `0.51.0`. **Ask** before going on.

4. Release: `$ENS release next minor --yes`. If it stops partway, read
   `.ensemble/release/state/<tag>.json` and finish with
   `$ENS release resume <tag> --yes` — never start a second release.

5. Re-pin ensemble's own kits to the release, so copies outside the workspace
   resolve the new kit-sdk API. In `$WORK/ensemble`, set
   `"@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk@^0.51.0"` in the `deno.json` of
   every kit under `.ensemble/kits/` that pins an older `^0.4x`/`^0.50` version
   (at least `deploy/compose`, `deploy/aws`, `pack/docker`, `pack/deno.compile`,
   `pack/vscode`, `lib/jsr`). Run the kits' tests
   (`deno test -A .ensemble/kits/deploy/compose .ensemble/kits/pack/docker`),
   then commit with one summary line, for example
   `fix(kits): pin the kits to @ensemble/kit-sdk ^0.51.0`, and ask before
   pushing.

## 2. Sync the docker and compose kits

Kits are vendored: each repository holds its own copy, and ensemble's is the
reference. idhn and khatm can't release until theirs have the authorize step,
and portal should match too. For each of `idhn`, `khatm` and `portal`:

```sh
for kit in pack/docker deploy/compose; do
  rm -rf $WORK/<repo>/.ensemble/kits/$kit
  cp -r $WORK/ensemble/.ensemble/kits/$kit $WORK/<repo>/.ensemble/kits/$kit
done
```

Then:

- check the copies are identical:
  `diff -r $WORK/ensemble/.ensemble/kits/pack/docker $WORK/<repo>/.ensemble/kits/pack/docker`
  prints nothing (ignore any `.stage` directory);
- **`.ensemble/kits/` is gitignored in these repositories**: a file new to the
  copy (`authorize.ts`, `push-authorization.ts`, its test) is invisible to
  `git status` until force-added. Run
  `git add -f .ensemble/kits/pack/docker .ensemble/kits/deploy/compose` and
  check with `git status` that the new files are staged — a missing file breaks
  the kit for everyone who clones it (this happened once already);
- commit with one summary line, for example
  `fix(kits): sync the docker and compose kits from ensemble 0.51.0`, and ask
  before pushing.

Leave `ensemble-node` alone: it has its own Node kits.

Deno refuses dependencies published less than 24 hours ago by default. `ens`
runs kits with `--minimum-dependency-age 0`, so packs and releases work right
away; a plain `deno check` or `deno test` in these repositories may not until
the next day — that's expected, not a failure.

## 3. Release idhn and khatm

**Needs:** `docker login ghcr.io` with a token that may write packages to the
`ritajhq` organization (ask the person for it; never store it in a file
yourself).

For each of `$WORK/idhn` and `$WORK/khatm`, with the installed `ens` (now 0.51.0
— `ens version`; install it with
`curl -fsSL https://raw.githubusercontent.com/ritajhq/ensemble/main/.ensemble/install.sh | sh`
if needed):

1. `ens release next patch --dry-run`: it must plan to publish
   `ghcr.io/ritajhq/idhn/{guard-standalone,judge-server,policy-builder}` (or
   `ghcr.io/ritajhq/khatm/khatm`), and must not be refused. Neither has released
   before, so the version will be `0.0.1`.
2. **Ask**, then `ens release next patch --yes`.

New GitHub packages are **private**. Either make the four packages public
(GitHub → the package → settings), or make sure every host that builds the
platform is logged in to ghcr.io with read access. Ask the person which.

Once these are out, clear the local pack vars from step 1 on the machine that
released ensemble, so it builds from the published images again:

```sh
cd $WORK/ensemble && $EDITOR .ensemble/config.local.yaml   # remove vars.pack.platform-*
```

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

   Later redeploys are the same command without `--emulate-externals`.

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

Tell the person, in a few lines: which steps ran, every version released
(ensemble, idhn, khatm), the commits made and whether they were pushed, where
the env file is (`~/.config/ens-platform/platform.env`, and that it needs
backing up), what the tunnel now routes, and anything you skipped or that
failed, with its output.

## Known gaps (not yours to fix now)

- Redeploying the platform _from_ the platform kills its own run halfway:
  redeploy it from a shell, as in step 4.
- Kit credentials (AWS keys, a remote Docker host) have nowhere to live in the
  platform yet; only compose on this host's Docker works.
- A deploy reads the manifest at the branch's tip, not at the version deployed.
- A preview runs whatever its branch holds on this Docker host: track only
  branches whose authors you'd let deploy here.
