# Delivery manifests

A delivery manifest (`ci/<name>/delivery.yml`) declares **what** a workload
is — its computes, databases, storage, networking, secrets, and variables —
and nothing about **how** any of it gets built or brought up. A deploy kit
reads the same manifest and decides that part; the same manifest runs
against a local dev stack or a real target without forking into
per-environment code paths.

The full, authoritative shape is [`docs/delivery.schema.json`](../delivery.schema.json)
— this page is the human-readable tour, not a substitute for it. See
[the schema reference](../reference/delivery-manifest-schema.md) for how the
two relate.

## Shape

A manifest has two top-level sections:

```yaml
version: v1

release:
  app:
    kit: docker

deploy:
  compute:
    server:
      type: container-orchestrated
      replicas: 2
      image: ${release.app.image}
      env:
        DATABASE_URL: ${databases.db.url}

  databases:
    db:
      type: relational
      engine: postgres
      version: "16"
      user: app
      database: app
      passwordSecret: db_password
```

- **`release`** — one entry per ship (`kit`, optional `mode`, optional
  `publish:`), describing how the ship packs and (optionally) publishes. A
  compute references its image as `${release.<ship>.image}`, resolved to
  the packed local tag; the registry lives on the `publish:` side, never in
  the local tag.

- **`deploy`** — the workload's resources, grouped into **categories**:
  `compute`, `storage`, `databases`, `messaging`, `networking`, `secrets`,
  `variables`, `external`. Each category holds named entries; a category
  with more than one possible shape uses a `type:` discriminant (its
  **kind**). Only three kinds have a seeded, fully-typed contract today —
  `compute`'s `container-orchestrated`, `storage`'s `volume`, and
  `databases`' `relational` (a Postgres-shaped resource: `engine`,
  `version`, `user`, `database`, `passwordSecret` in, `host`/`port`/`user`/
  `database`/`url` out). Any other kind (a `key-value` database, a
  `load-balancer`, a message queue, ...) is validated only as a generic
  `{ type, class?, capabilities? }` shape until a contract is registered for
  it — its real fields are whatever a deploy kit's provisioner expects, not
  something this schema checks. `variables` and `secrets` are single-kind
  categories and need no `type` at all.

## References and batches

Entries wire to each other by **reference**:
`${category.name.output}` (e.g. `${databases.db.url}`,
`${storage.data.name}`, `${compute.server.<port-name>}`). Every reference is
validated, and entries are topologically grouped into dependency-ordered
**batches** so a deploy kit can bring resources up in the right order
without re-deriving it itself.

`variables` (value from the deploy's process env, referenced as
`${variables.<name>.value}`) and `secrets` with `source: environment` both
read their value from `ens`'s own process environment, making
per-environment values explicit: declared in the manifest, but supplied by
the surrounding pipeline (a real deploy pipeline loads them from its
secrets manager before invoking `ens`; locally, you export them yourself).
How a secret then reaches the workload is up to the deploy kit — `compose`
wires it as a native `${VAR}` env-var interpolation and only supports
`source: environment` today; `source: file`, for a secret whose value
already lives in a file, is declared in the schema but not yet exercised by
either built-in kit. Environment selection is not an `ens` concept —
`ens deploy`'s `--artifacts local|published` and `ens develop` are a
dev-loop-vs-not toggle, not an environment switch.

## Capabilities and classes

A resource entry can optionally declare `class` (e.g. `critical`) and
`capabilities` (negotiated features requested from the deploy kit, e.g.
`deletionProtection` on a database). A kit that can't satisfy a requested
capability hard-fails `ens deploy` unless you pass
`--accept-capability-gaps`. Contract fields are added deliberately, only
once a second real deploy target proves the shape is needed — an
apparently obvious field being absent from a resource type is usually a
deliberate choice, not an oversight. Use `ens deploy <name> <kit> explain
<category.name>` to see exactly which provisioner matched a given entry,
why any others didn't, and where each resolved value came from — see
[the CLI reference](../reference/cli/deploy.md#explain).

## `storage` on `aws`

`storage.volume` is fully wired for the `compose` kit (a named Docker
volume) but has no provisioner on `aws` yet — targeting `aws` with a
`storage.volume` entry hard-fails instead of silently dropping it, unlike
`ports` or `networks`, which `aws` does drop.

## Next

- [Deploying](../guides/deploying.md) — how `ens deploy`/`ens develop`
  actually drive a kit through this manifest.
- [Delivery manifest schema reference](../reference/delivery-manifest-schema.md)
