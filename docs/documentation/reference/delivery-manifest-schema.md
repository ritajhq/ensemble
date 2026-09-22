# Delivery manifest schema reference

The authoritative, machine-readable shape of `ci/<name>/delivery.yml` is
[`docs/delivery.schema.json`](../delivery.schema.json) — a JSON Schema kept
in sync with `manifest/parser.ts`. Point your editor's YAML language server
at it for inline validation and completion:

```yaml
# yaml-language-server: $schema=../../docs/delivery.schema.json
version: v1
```

This repo's own manifests do exactly this: `ci/website/delivery.yml` points
at it with that relative path, `ci/cli/delivery.yml` with the absolute
`raw.githubusercontent.com` URL instead — either form works, an absolute
URL is just resilient to the file being opened from a different working
directory.

This page is a reading guide to that schema, not a restatement of it — see
[Delivery manifests](../concepts/delivery-manifests.md) for the narrative
version of the same model.

## Top level

- `version` — always `"v1"` today.
- `release` — map of ship name → `{ kit, mode?, outputName?, publish? }`.
- `deploy` — map of category → map of resource name → a category-specific
  shape (see below).

## Fully-typed resource shapes

Three resource kinds have a dedicated schema definition, matching a seeded
`ResourceContract`:

| Schema definition | Category | `type` | Required fields | Declared outputs |
|---|---|---|---|---|
| `containerOrchestratedResource` | `compute` | `container-orchestrated` | `image`, `replicas` | (none listed — see note below) |
| `storageVolumeResource` | `storage` | `volume` | _(none beyond `type`)_ | `name` |
| `relationalResource` | `databases` | `relational` | `engine`, `version`, `user`, `database`, `passwordSecret` | `host`, `port`, `user`, `database`, `url` |

A `container-orchestrated` compute's `ports` map is itself the reference
surface for its ports (`${compute.<name>.<port-name>}`) rather than a
separate `outputs` list.

## Generic resource shapes

Everything else — `messaging`, `networking`, and any `databases`/`compute`
kind beyond the three above (a `key-value` database, a `load-balancer`,
...) — validates only against `resourceDeclaration`: `{ type, class?,
capabilities? }`. Its real fields are whatever a deploy kit's provisioner
expects; this schema doesn't check them, since no contract is registered
for that kind yet. Don't assume a kind not in the table above has any
particular field until you've checked the deploy kit you're targeting.

## `secrets`, `variables`, `external`

- `secrets` — `{ source: "file" | "environment" }`. `ens` never mints a
  secret's value; it only wires whichever source you declare through to
  the deploy kit. `source: file` is declared here but not yet implemented
  by either built-in kit (`compose` only supports `environment`, wired as
  a native `${VAR}` interpolation).
- `variables` — a permissive passthrough bag (`{ type: "object" }`), read
  from `ens`'s own process environment at deploy time.
- `external` — `{ type, name }`. A resource `ens` doesn't provision, only
  references by the name it already has outside `ens`'s management (see
  `--emulate-externals` in the [`ens deploy` reference](cli/deploy.md) for
  the local-dev exception).

## `mounts` and `development`

- `mounts` (on a `container-orchestrated` compute) — `{ source, path,
  readOnly? }[]`, attaching a `storage.volume` entry's `${storage.<name>.name}`
  output.
- `development` — developer-owned sync intent for `ens deploy --watch`,
  grouped by action: `sync` (copy files) and `sync+restart` (copy, then
  restart the container). Each rule is `{ app, path, ignore? }`. Honored
  only by provisioners that support it.

## Capability negotiation

`class` (e.g. `critical`) and `capabilities` are accepted on every resource
shape. A capability a kit can't satisfy hard-fails `ens deploy` unless you
pass `--accept-capability-gaps`. Some fields only materialize on certain
kits given a certain `class` — e.g. `relational`'s `deletionProtection`
only becomes a real property on `aws` (RDS), not on `compose`, which has no
equivalent to render it into.
