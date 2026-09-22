# `ens app`

Manage apps under `source/apps/`.

## `ens app create <kit> <name>`

Scaffold a new app with a build kit's hello-world template.

```sh
ens app create react web
ens app create deno.bundle api
```

- `<kit>` — the build kit to scaffold from (e.g. `react`, `deno.bundle`).
- `<name>` — the app's name under `source/apps/` (supports nesting, e.g.
  `my_app/server`).
- `--target <target>` — a static build variant to scaffold for, if the kit
  declares one (e.g. the `react` kit's `ssr` variant).

```sh
ens app create react web --target ssr
```
