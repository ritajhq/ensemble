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

Five resource kinds have a dedicated schema definition, matching a seeded
`ResourceContract`:

| Schema definition | Category | `type` | Required fields | Declared outputs |
|---|---|---|---|---|
| `containerOrchestratedResource` | `compute` | `container-orchestrated` | `image`, `replicas` | (none listed — see note below) |
| `storageVolumeResource` | `storage` | `volume` | _(none beyond `type`)_ | `name` |
| `objectStorageResource` | `storage` | `object-storage` | `bucket` | `url`, `bucket` |
| `relationalResource` | `databases` | `relational` | `engine`, `version`, `user`, `database`, `passwordSecret` | `host`, `port`, `user`, `database`, `url` |
| `gatewayResource` | `networking` | `gateway` | `network`, `routes` | (none — nothing references `${networking.*}` yet) |

A `container-orchestrated` compute's `ports` map is itself the reference
surface for its ports (`${compute.<name>.<port-name>}`) rather than a
separate `outputs` list. The name is yours to choose — nothing reads
meaning into it — and each value is the port the container listens on.
`compose` publishes each of those on an ephemeral host port of its own
(`docker compose port <service> <port>` to look one up), never pinning the
container's number onto the host, so several computes declaring the same
container port is fine — they only ever share the compose network, where
anything that needs a compute reaches it as `<service>:<port>`, the same
address a compute's own `${compute.*}` references and the gateway's routes
resolve to.

`relationalResource` also accepts an optional `init` — a list of
repo-relative SQL/shell file paths run against a fresh database on
startup. `compose` mounts each one read-only into postgres's own
`docker-entrypoint-initdb.d`, in filename order; `aws` drops it silently,
same as `ports`/`networks` elsewhere, since an already-provisioned RDS
instance has no equivalent hook.

`objectStorageResource` also accepts optional `accessKeySecret`/
`secretKeySecret` — names of `secrets` entries supplying static S3
credentials. `compose` (Garage) requires both, since Garage has no other way
to get static credentials — and in Garage's own format, which it validates
when it imports the pair after the bucket's container comes up: the access
key is `GK` followed by 24 hex characters, the secret key 64 hex characters.
`aws` (a plain `AWS::S3::Bucket`) drops both silently, since IAM always mints
its own access keys rather than importing a caller-chosen pair — a manifest
targeting aws only can omit them.

`gatewayResource` is implemented only on `compose` (Caddy) today — declaring
one targeting aws has no provisioner to satisfy it, the same kind of
deliberate gap `storage.volume` had before it had a second target. Its
`routes` array is shallow at the schema level (each entry's real shape,
`{ host, path, target: { service, port } }`, is documented but not deeply
validated): `path` is either a plain prefix string (the full request URI is
forwarded unchanged) or `{ match, strip: true }` to strip the matched prefix
before forwarding; `target.service` names the compute to route to as a plain
string, and `target.port` is usually `${compute.<name>.<port>}` — split
apart rather than one combined reference, since a compute-port reference
alone always bakes to a bare number, never the compute's own name. `tls:
internal` is rendered on `compose`: Caddy mints its own local CA and serves
HTTPS on 8443, keeping that CA on a named volume so a recreated gateway
doesn't invalidate a certificate you already trusted. Any other `tls` value
is accepted but not rendered, and leaving it unset keeps the plain-HTTP
gateway.

## Generic resource shapes

Everything else — `messaging`, any `networking` kind other than `gateway`,
and any `databases`/`compute` kind beyond the ones above (a `key-value`
database, a `load-balancer`, ...) — validates only against
`resourceDeclaration`: `{ type, class?, capabilities? }`. Its real fields
are whatever a deploy kit's provisioner expects; this schema doesn't check
them, since no contract is registered for that kind yet. Don't assume a kind
not in the table above has any particular field until you've checked the
deploy kit you're targeting.

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
