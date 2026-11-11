# `.ensemble/config.yaml`

The project's shared configuration, tracked in git: which languages it uses,
which kit builds each app and packs each ship, how its workloads deploy by
default, which libraries it publishes, and what runs after a release. Every key
is optional. `ens` writes most of it for you (`ens app create`, `ens lib new`,
`ens config set-build-kit`) and keeps your comments and layout when it does.

```yaml
ecosystems:
  - deno
  - cargo

tools:
  cargo:
    rust: 1.90.0
  deno:
    deno: "2.9"

build:
  web:
    kit: react
    target: ssr
  api:
    kit: deno.bundle
    options:
      format: cjs
  server: # built only through its integrations
    integrations:
      aws:
        kit: deno.bundle

pack:
  desktop:
    kit: tauri
    mode: installer

deploy:
  shop:
    kit: aws
    development:
      runtime: false

publish:
  core:
    - name: core
      package: "@acme/core"
      publish:
        - kit: jsr
  libs:
    - name: money
      package: "@acme/money"
      publish:
        - kit: jsr

hooks:
  release:
    after:
      - name: changelog
        run: git-cliff --latest --prepend CHANGELOG.md
```

## `ecosystems`

The languages the project's packages are written in, each an ecosystem kit under
`.ensemble/kits/ecosystem/<name>` or the built-in `deno`. A project that lists
none uses `deno`. The first is the default for `ens lib new`.
`ens init
--ecosystem` sets it, and `ens app create` adds the ecosystem a build
kit needs. See [Ecosystem kits](../concepts/kits.md#ecosystem-kits).

## `tools`

Tool versions everyone on the project runs, by ecosystem, then by tool. Each
ecosystem decides what a pin means, and refuses a tool it doesn't know or a
version the machine can't run. Quote a version with fewer than three parts, as
YAML reads `1.90` as the number `1.9`. A pin applies to what `ens` starts
(builds, packs, releases, `ens exec`), not to a tool you run yourself.

## `build.<app>`

How `ens build <app>` builds `source/apps/<app>`. An app is built one of two
ways, never both:

- **On its own:**
  - `kit` — the build kit, under `.ensemble/kits/build/`.
  - `target` — a variant the kit declares, such as the `react` kit's `ssr`.
  - `options` — settings handed to the kit untouched, for it to interpret (the
    `deno.bundle` kit's `format` and `external`).
- **Through integrations:** `integrations.<deploy kit>` holds the same `kit`,
  `target` and `options` for each platform the app is wired for, built from
  `source/integrations/<deploy kit>/<app>`. See
  [Integrations](../concepts/workspace-layout.md#integrations).

## `pack.<ship>`

What `ens pack <ship>` uses when the command names nothing else:

- `kit` — the pack kit, under `.ensemble/kits/pack/`.
- `mode` — one of the modes the kit's `kit.yml` declares. Default: its first.
- `outputName` — the packed output's name. Default: the ship's name.

A pack builds the apps its kit says it needs first. An old `needs:` key is
refused.

## `deploy.<name>`

Defaults for the workload at `ci/<name>/delivery.yml`:

- `kit` — the deploy kit `ens deploy <name>` and `ens develop <name>` use when
  the command names none.
- `development.runtime` — whether `ens develop` brings up the kit's local
  runtime (the HTTPS proxy for compose, MiniStack for aws) if none is running.
  Default: `true`. `--no-runtime` turns it off for one run.

## `publish`

The libraries the project publishes. Nothing about publishing is written inside
a library's own folder.

- `publish.core` — libraries under `source/core/<name>`, published together by
  `ens release`, in the order their dependencies need.
- `publish.libs` — libraries under `source/libs/<name>`, published one at a time
  with `ens lib publish`. `ens lib new` adds an entry.

Each entry has:

- `name` — the folder under `source/core/` or `source/libs/`.
- `package` — the name it publishes under.
- `publish` — a list of `{ kit, target? }`: the lib kits under
  `.ensemble/kits/lib/` it publishes through, and the destination, for a kit
  with more than one.

See [Managing libraries](../guides/managing-libraries.md) and
[`ens release`](cli/release.md).

## `hooks`

`hooks.release.after` is a list of `{ name, run }` shell commands run from the
repository root, in order, once a release has published everything. The
release's tag is in `$ENSEMBLE_RELEASE_TAG`, and whatever they commit is pushed.
A hook runs once per tag, so `ens release resume` doesn't repeat it.

## `.ensemble/config.local.yaml`

The gitignored counterpart: one developer's default build and pack variables,
written by `ens config set-build-var` and `set-pack-var`:

```yaml
vars:
  build:
    web:
      API_URL: http://localhost:4000
  pack:
    web:
      TAG: dev
```

They win over `source/envs/build/<app>.env` and `source/envs/pack/<ship>.env`,
and a `-v KEY=VALUE` on the command line wins over both.
