# Drawing a workload's architecture

How to turn a workload (`ci/<name>/delivery.yml`) into an architecture diagram
that explains it, rather than one that lists every resource. The facts come from
`ens`; the drawing tool is separate. When the Archify skill is available, follow
it for the diagram format, `finalize` and repair, and use this page for what to
put in it.

## Get the topology from `ens`, not by reading YAML

```sh
ens delivery print <name>        # JSON; needs no kit and no secrets
```

- `entries[]`: every declared resource, with `id` (`compute.api`), `category`,
  `type` (`container`, `relational`, `object-storage`, `volume`, `gateway`,
  `network`, …), `details` and `layer`.
- `relations[]`: one per reference, `{ from, to, via }`, where `via` names the
  manifest field that makes it (`env.PGHOST`, `envSecrets.PGPASSWORD`, a gateway
  route's target). They are already resolved, so no edge is guessed from a
  hostname.
- `layer` is dependency depth: `0` depends on nothing. It's a hint for which
  side stores and leaves go on, not for the order a request travels in.

Drop the `variables.*` and `secrets.*` entries and every relation to them: they
are configuration, not topology. A relation's `via` decides its label: a
`PGHOST` is SQL to the database, a `*_URL` to a compute is a call, a gateway
target is an entry route.

`ens delivery print <name> -r markdown` writes a literal drawing of the same
graph to `docs/<name>/`. Use it as the checklist of what exists, not as the
picture to explain.

## Get the meaning from the manifest's comments

Relations say that `cover` reaches `compute.maps`; only the manifest says why.
Read the comment above each resource in `ci/<name>/delivery.yml` before naming
or grouping it: projects record there what a service is for, who reaches it, and
what is internal only. Cite each node's block (its comment through its last
line) as its source. For a claim about code behaviour (a call, a write), follow
it into `source/apps/<app>` and cite that instead; a configured value alone (a
`META_APP_ID`) proves a setting, not a call, so say so.

## Map `ens` kinds to diagram roles

| `ens` entry                           | Role                                        |
| ------------------------------------- | ------------------------------------------- |
| `networking` gateway                  | the entry point: cloud / edge               |
| `compute` serving pages only          | frontend                                    |
| `compute` otherwise                   | backend, or security for an auth/authz role |
| `databases`, `storage` object-storage | database / store                            |
| `storage` volume                      | a store only when several computes share it |
| `external` network or service         | external, outside the workload's boundary   |

## Compose for the reader

- **Lead with the request path.** Start from who uses it, through the external
  ingress and the gateway, to the computes the gateway's routes target, then the
  stores. Label entry edges with the host and path that select them
  (`dashboard.<domain> /api/*`), never with ports or container names.
- **One boundary per deployment.** Everything the workload deploys sits in one
  frame named for it; `external` networks and third-party services sit outside.
- **Merge repeated roles.** Several computes built from one pattern (a guard or
  sidecar per service, replicas) become one node whose sublabel says how many
  and why. Keep the per-instance mapping in a card.
- **Keep secondary paths out of the lines.** Back-calls that go round through an
  already drawn node, private volumes, and caches go in cards, so the main path
  stays readable. Say in a card what was left out.
- **Don't invent.** A volume is not a database cluster, a configured provider is
  not an observed call, and a resource the manifest doesn't declare doesn't
  appear.

## Run it

- Archify's CLI is a Node script with no dependencies. Without Node, run it with
  `deno run -A <archify>/bin/archify.mjs …`.
- Pin the evidence with `meta.repository` to a pushed commit for web links, or
  `link_mode: "local-only"` when that commit isn't on the remote yet.
- Draft in a gitignored folder (`.archify/`). The kept diagram is
  `docs/<name>/architecture.html`, rendered from `docs/<name>/architecture.json`
  (its `meta.output` set to that HTML), beside the `architecture.md` that
  `ens delivery print -r markdown` writes. Commit the JSON, the HTML and the
  `architecture.delivery.json` Archify writes next to it; pass
  `--out-dir .archify/docs-<name>` to `finalize` so its check receipts stay out
  of `docs/`.
