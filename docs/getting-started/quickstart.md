# Quickstart

This walks through the shortest path from nothing to a running app:
scaffold a project, scaffold an app, build it, and bring it up locally.
If you haven't installed `ens` yet, see [Installation](installation.md).

Read [Concepts](../concepts/workspace-layout.md) alongside this if you want
the "why" behind each step — this page is deliberately just the "how."

## 1. Scaffold a project

```sh
ens init
```

Prompts for a project name, then lays down the `source/` and `.ensemble/`
folders, fetches the built-in kits, and initializes a git repository.

## 2. Scaffold an app

```sh
ens app create react web
```

Creates `source/apps/web` from the `react` build kit's hello-world
template, already configured to use that kit. Swap `react` for `deno.bundle`
for a plain TypeScript service instead.

## 3. Build it

```sh
ens build web -m development
```

Runs the app's configured build kit and writes output to
`source/artifacts/web`.

## 4. Bring it up locally

A running deployment needs a workload manifest, not just a built app — see
[Local development](../guides/local-development.md) for the full loop
(pack → manifest → `ens develop`). If your project already has one (e.g.
`ci/web/delivery.yml`):

```sh
ens develop web
```

This builds, packs, and deploys the workload locally, watching for source
changes until you stop it.

## Where to next

- [Concepts](../concepts/workspace-layout.md) — the mental model behind the
  workspace, kits, and delivery manifests.
- [Local development](../guides/local-development.md) — the full
  build → pack → deploy loop, end to end.
- [CLI reference](../reference/cli/index.md) — every command's full flag list.
