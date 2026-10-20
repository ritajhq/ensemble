# `ens app`

Manage apps under `source/apps/`, and their integrations under
`source/integrations/`.

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

- `--integration <deploy kit>` — scaffold an existing app's integration for a
  deploy kit instead of the app: `source/integrations/<deploy kit>/<name>`,
  built as `integrations/<deploy kit>/<name>` (see
  [Integrations](../../concepts/workspace-layout.md#integrations)).

```sh
ens app create deno.bundle server --integration aws
```

App names under `integrations/` are refused: that prefix names integrations.
