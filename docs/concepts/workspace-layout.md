# Workspace layout

Ensemble's core idea is that a project's folder structure should tell you
where to find something without you needing to remember a convention. Every
concern — app source, packaging, build output, shared code, deployment —
gets its own top-level home, and nothing crosses those lines implicitly.

```
source/
  apps/<name>/       # app source, one folder per deployable unit
  core/               # shared code that speaks your project's domain
  libs/               # generic, cross-project-reusable code
  artifacts/<name>/   # build output (gitignored), one folder per app
  ship/<name>/        # packaging inputs (Dockerfile, etc.) per pack target
.ensemble/
  kits/build/<kit>/   # build kit implementations
  kits/pack/<kit>/    # pack kit implementations
  kits/deploy/<kit>/  # deploy kit implementations
  config.yaml         # shared, git-tracked: app -> kit associations
  config.local.yaml   # gitignored, per-developer: personal var defaults
ci/<name>/
  delivery.yml         # the workload's delivery manifest (release + deploy)
```

`apps/<name>` and `ship/<name>` both support nesting — a multi-process app
made of several independently built/packed units lives as
`apps/my_app/server` and `apps/my_app/client` (mirrored under
`ship/my_app/server`, `ship/my_app/client` if both get packed). `<name>`
throughout the CLI (`ens build <app>`, `ens config set-build-kit <app> <kit>`,
...) means that full path relative to `apps/`, not just the top-level folder.

## The principles behind the layout

- **Each app is self-contained.** Everything an app needs to build lives
  under its own `source/apps/<name>`. Every app is potentially a separate
  deployable artifact, so it should build and run independently of the
  others.

- **Concerns live in their own top-level folder.** Source (`source/apps`),
  packaging (`source/ship`), and build output (`source/artifacts`) are kept
  apart, so you can focus on the layer you're changing without wading
  through the others.

- **Shared code is explicit and intentional.** Cross-cutting logic lives in
  `source/core` and `source/libs`, pulled in deliberately instead of apps
  reaching into each other's folders. `core` speaks your project's own
  domain; `libs` is generic enough to be reused across projects — see
  [Managing libraries](../guides/managing-libraries.md) for how a lib gets
  shared out.

- **Kits carry the mess so app folders don't have to.** Build, pack, and
  deploy logic lives in `.ensemble/kits`, behind a common contract. An app
  folder only ever states _which_ kit it uses, never _how_ that kit builds,
  packages, or deploys it. See [Kits](kits.md).

## `.ensemble/config.yaml` vs `.ensemble/config.local.yaml`

Two files hold configuration, split by what should be shared with the team
versus what's a personal convenience:

- **`config.yaml`** — shared, git-tracked. Which build kit each app uses
  (`ens config set-build-kit`).
- **`config.local.yaml`** — gitignored, per-developer. Default build/pack
  vars you don't want to type on every invocation (`ens config
  set-build-var`, `ens config set-pack-var`).

## Next

- [Kits](kits.md) — what a kit is and the three roles it can play.
- [Delivery manifests](delivery-manifests.md) — how a workload is declared
  and brought up.
