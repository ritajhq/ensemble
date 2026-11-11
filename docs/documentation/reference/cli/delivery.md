# `ens delivery`

Prints a delivery as declared by the workload's manifest. (Running a workload's
operations is [`ens operation`](operations.md).)

```sh
ens delivery print <name> [-r json|markdown] [-o <path>]
```

## `ens delivery print`

Prints what `ci/<name>/delivery.yml` declares. For now that is the architecture
of its `deploy` block.

```sh
ens delivery print website
ens delivery print website --render markdown
```

It reads the manifest as written, so it needs no deploy kit, env file or secret.
`--render json`, the default, prints an `entries` list, one per piece of the
`deploy` block (compute, storage, databases, messaging, networking, secrets,
variables, external), and a `relations` list, one per use of an entry by
another:

- an entry has its `id` (`compute.server`), `category`, `name`, `type`, an
  `icon` name (a file in `source/core/delivery/icons/`), a `layer` (0 uses
  nothing; each later one uses an earlier one), `details` as label/value pairs,
  and a `description` where a secret or variable declares one.
- a relation has `from`, `to` and `via`, the field of `from` that uses `to`. It
  is found from `${...}` references in any field and from secrets named the way
  contracts name them (`envSecrets` values, fields ending in `Secret`). `to` can
  be a release (`release.<name>`), which is not an entry here.

A reference to an undeclared entry, or a cycle, fails the command. A value that
is one whole reference is shown as its name alone (`release.api` for
`${release.api}`).

A compute uses another compute only where a field says so with a reference to
its address (`http://${compute.judge.host}:${compute.judge.http}`). A host name
written out by hand is a string to `ens`, so no relation, and no line, comes of
it. Naming an address needs the other compute neither rendered first nor above,
so computes that refer to each other can all be in one layer of the JSON; the
drawing orders them by the calls instead.

### `--render markdown`

Draws the architecture with [reladraw](https://github.com/reladraw/reladraw) and
writes four files that share a name, in `docs/<name>/` unless `-o <path>` names
the page (the folder is created if it doesn't exist):

- `architecture.md` — the drawing, then one table of the variables and secrets
  (typed `variable: <type>` or `secret: <source>`, with their description,
  default and what uses them) and a sentence naming the externals the deployment
  expects to exist. The computes and storage are in the drawing only.
- `architecture.svg` and `architecture-light.svg` — the drawing, for a dark page
  and for a light one (the page shows the one that suits the reader's theme):
  computes in rows by how far down the calls between them they sit (a compute
  nothing calls on top, each below the ones that call it, two that call each
  other side by side), then storage under all of them, with lines turning at
  right angles from what uses to what is used, each at a height of its own, and
  going round the boxes of the rows it passes by a lane at the left. Each
  compute has a color: its box's border, and every line it leaves by (an arrow
  at both ends where two use each other, in the color of the first). A network
  is not a node: it is a tinted area, with the network icon and its name in its
  top-left corner, around the computes attached to it by their `networks`, and a
  compute on two networks sits where the two areas overlap. Variables and
  secrets are not in it, nor lines to them; the tables list them.
- `architecture.reladraw` — the dark drawing's source; the light one differs in
  its colors only.

reladraw may report how the drawing reads (a line crossing a box, say). That
doesn't stop the files being written; `reladraw check architecture.reladraw`
lists what it found.
