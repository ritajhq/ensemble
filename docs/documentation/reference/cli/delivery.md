# `ens delivery`

Commands that act on, or print, a delivery as declared by the workload's
manifest.

```sh
ens delivery task <name> [task] [args...] [-k <kit>]
ens delivery print <name> [-r json|markdown] [-o <path>]
```

## `ens delivery task`

Runs one of the tasks declared under `tasks:` in `ci/<name>/delivery.yml`. With
no task named, it lists the ones the workload declares instead of running
anything:

```sh
ens delivery task portal                 # list
ens delivery task portal auth-migrate    # run
ens delivery task portal trust-gateway-ca --force
```

`--instance <slug>` runs the task against that named instance of the workload
(see [`ens deploy --instance`](deploy.md)): `${deployment.name}` and
`${deployment.artifact}` name the instance's own deployment, and the snapshot
below is the one that instance's deploy left.

Trailing arguments are handed to the task as `$1..$n`. A task that exits
non-zero makes this command exit non-zero too — that invocation failed; no
deploy started, so there is nothing to roll back.

The kit is `-k <kit>`, else the one `deploy.<name>.kit` in
`.ensemble/config.yaml` names (as for `ens deploy`). A task needs one because
its `arguments` may reference anything a resource field may
(`${databases.database.host}`, `${compute.web.http}`), and only a kit can render
the workload to resolve those.

### Where argument values come from

A task acts on what is deployed, so it first looks for what the last deploy left
for it. Every `ens deploy` that applies (or starts a watch session, as
`ens develop` does) keeps each task argument only a render can answer — a
provisioner's output, a port, a release — in
`.ensemble/deploy/<name>/<kit>.tasks.json`, gitignored like the render cache
next to it. The rest are resolved when the task runs, as always: literals,
`${variables.*}` (from the environment and the env files, so no variable — and
no secret — is ever written there), `${external.*}`, and
`${deployment.name}`/`${deployment.root}`. With that file, a task runs without
loading the kit at all.

An argument may also embed references in a larger string, as a resource field
may
(`AUTH_BASE_URL: https://auth.${variables.domain.value}${variables.origin_port.value}`).
Embedded references the file doesn't need are interpolated when the task runs.
One that only a render can answer is never written to the file, since the string
may embed a variable holding a secret, so a task with one always renders.

It is used only while it still describes the deployment: if
`ci/<name>/delivery.yml`, the kit, or `ci/<name>/<kit>.config.yml` has changed
since that deploy (or the task gained an argument the deploy couldn't know
about), the command says so and resolves the arguments by rendering instead.
That render covers only the resources the task's arguments reference and what
those depend on — unless it references `${deployment.artifact}`, which names the
file a render of the whole workload is presented as. The render happens before
the task runs, so a broken reference fails with the manifest's own error rather
than halfway through a migration.

- `--artifacts <local|published>` — which release locator to resolve
  `${release.<name>}` references against when rendering. Defaults to
  `published`, matching `ens deploy`. The last deploy's values are used whatever
  this says: they are what's running.
- `--version <version>` — the released version to resolve those references to
  when rendering. Defaults to `latest`.
- `--env-file <path>` — load an env file (repo-root relative or absolute,
  repeatable) as values beneath the process environment. None by default: a real
  environment's pipeline exports every value itself.

See [`tasks` in the manifest schema](../delivery-manifest-schema.md#tasks) for
what a task declares, and in particular the `${deployment.*}` namespace that
lets a script name the deployment's own artifact, project, and root instead of
hardcoding what `docker compose` derives.

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

- `architecture.md` — the drawing, and for each category a table of its entries
  with what they use and what uses them.
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
