# Delivery manifests

`ci/<name>/delivery.yml` declares **what** a workload is, and nothing about
**how** a target brings it up: the deploy kit decides that. One manifest serves
every target and every environment. Where they differ, the difference is a
`variables` entry.

The machine-readable shape is `docs/delivery.schema.json` in the ensemble
repository. Point the YAML language server at it on the first line:
`# yaml-language-server: $schema=https://raw.githubusercontent.com/ritajhq/ensemble/main/docs/delivery.schema.json`.
`ens lsp` also completes `${…}` references.

## Sections

```yaml
version: v1

# One entry per ship: how it packs and, optionally, publishes.
release:
  api:
    kit: docker
    publish:
      target: push
      name: ghcr.io/acme/api

# The resources, by category, then by name.
deploy:
  compute:
    api:
      type: container
      image: ${release.api}
      replicas: 1
      ports:
        http: 8000 # the container's port, named; referenced as ${compute.api.http}
      env:
        DATABASE_URL: ${databases.db.url}
        PUBLIC_URL: https://${variables.domain.value}
      envSecrets:
        SESSION_KEY: session-key # environment variable <- secrets entry
      networks:
        - ${external.edge.name}
      development:
        sync:
          - app: api
            path: /app

  databases:
    db:
      type: relational
      engine: postgres
      version: "16"
      user: app
      database: app
      passwordSecret: db-password

  secrets:
    db-password:
      source: environment
      description: Postgres password
    session-key:
      source: environment

  variables:
    domain:
      default: api.lvh.me
      description: Host the API answers on

  external:
    edge:
      type: network
      name: edge

# Run by hand with `ens delivery task`, never by a deploy.
tasks:
  migrate:
    script: migrate.sh # ci/<name>/tasks/migrate.sh; or `run:` for a one-liner
    arguments: # become the script's environment variables
      project: ${deployment.name}
      artifact: ${deployment.artifact}

# Started by `ens develop` only, after deploy: programs on this machine.
launch:
  worker:
    type: process
    command:
      - ${build.worker}/run
    ports:
      http: auto # picked at start, kept across restarts; ${launch.worker.http}
    development:
      restart:
        - build: worker
```

## References

`${category.name.output}` wires one entry to another. `ens` validates every
reference and orders entries into dependency batches, so there's no `depends_on`
to write.

| Reference                                                     | Resolves to                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `${release.<ship>}`                                           | the ship's primary output: a local tag with `--artifacts local`, else the published one |
| `${compute.<name>.host}` / `.<port-name>`                     | the address another compute on a shared network reaches it by                           |
| `${databases.<name>.host\|port\|user\|database\|url}`         | a relational database's outputs                                                         |
| `${storage.<name>.name}` / `.url` / `.bucket`                 | a volume's name; an object-storage bucket's URL and name                                |
| `${variables.<name>.value}`                                   | the value from the environment, or `default:`                                           |
| `${external.<name>.name}`                                     | something `ens` doesn't create, by its existing name                                    |
| `${deployment.name\|artifact\|root}`                          | only in `tasks`: the deployment's own identity                                          |
| `${build.<app>}`, `${pack.<ship>}`, `${launch.<name>.<port>}` | only in `launch`, which can't reference deploy resources yet                            |

A reference can be the whole value or sit inside a string
(`https://${variables.domain.value}`). A `${HOME}`-style string that doesn't
start with a category passes through untouched. A hostname written out by hand
is just a string, so it creates no relation and no ordering.

## Resource kinds

Categories: `compute`, `storage`, `databases`, `messaging`, `networking`,
`secrets`, `variables`, `external`. A category with several shapes picks one
with `type:`. Kinds with a typed contract:

| Category     | `type`           | Required                                                  |
| ------------ | ---------------- | --------------------------------------------------------- |
| `compute`    | `container`      | `image`, `replicas`                                       |
| `compute`    | `function`       | per kit (aws, cloudflare)                                 |
| `storage`    | `volume`         | —                                                         |
| `storage`    | `object-storage` | `bucket`                                                  |
| `databases`  | `relational`     | `engine`, `version`, `user`, `database`, `passwordSecret` |
| `databases`  | `key-value`      | per kit (aws, cloudflare)                                 |
| `networking` | `gateway`        | `routes`; `tls: internal\|none`                           |

Support differs by kit, on purpose. Not every kit provisions every kind; some
drop a field (aws drops `ports`/`networks`) and some hard-fail. Before relying
on a field, read the target kit's provisioner in
`.ensemble/kits/deploy/<kit>/provisioners/`, or run
`ens deploy <name> <kit> explain <category.name>`.

`class` and `capabilities` (e.g. `deletionProtection`) can go on any resource. A
capability the kit can't satisfy fails the deploy unless
`--accept-capability-gaps` is passed.

## Variables and secrets

- `variables`: `{ type?, default?, description? }`. `type: list` splits a
  comma-separated value into a list.
- `secrets`: `{ source: environment | file, description? }`. `ens` never creates
  a secret's value. compose supports only `environment`.
- Both read the process environment variable named after the entry, uppercased,
  with `-` turned into `_` (`db-password` → `DB_PASSWORD`).
- Values come from the pipeline's environment. `ens develop` also loads
  `ci/<name>/dev.env` (committed dev values), `ci/<name>/<kit>.env` (one kit's
  local target) and `.ensemble/deploy/<name>/secrets.env` (untracked). Env files
  are flat `KEY=value`, with no `$` expansion and no duplicate keys. Exported
  values win.
- A value that only development sets, such as live reload or a local domain, is
  a variable with its dev value in `dev.env`. It is never a separate manifest or
  a mode.

## `development`

Under a resource, `development.sync` / `development.sync+restart` hold rules
`{ app, path, ignore? }`. While `ens develop` runs, they copy an app's build
output into the running resource, restarting it for `sync+restart`. On aws, they
redeploy a `function`'s code or re-upload a bucket's contents. They add nothing
to the render itself.

## Instances

`ens deploy <name> <kit> --instance <slug>` deploys a second copy alongside the
first (a branch preview, say), with its own deployment name
`<repo>-<name>--<slug>` and its own state. `ens destroy … --instance <slug>`
removes it.
