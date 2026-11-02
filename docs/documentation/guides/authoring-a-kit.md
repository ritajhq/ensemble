# Authoring a kit

Kits live under `.ensemble/kits/<role>/<name>` and are managed end-to-end
through the `ens kit` command group — from scaffolding a brand-new one to
sharing a locally-authored one out to its own repository. See
[Kits](../concepts/kits.md) for what a kit's contract looks like per role
(`build`, `pack`, `deploy`) before writing one.

## Scaffold a new kit

```sh
ens kit new my-deploy-target deploy
```

Scaffolds `.ensemble/kits/deploy/my-deploy-target`. `<role>` is one of `build`,
`pack`, `deploy`, `ecosystem`, or `lib` (a kit-shaped package a library
publishes through — see [Managing libraries](managing-libraries.md)).

The scaffolded `kit.yml` names the kit's `role` and the `protocol` it speaks.
Keep both: `ens kit install`, `pin` and `eject` refuse a kit without them. A
pack kit that declares `publish:` targets also needs a `publish.ts`. A build kit
whose apps must belong to an ecosystem adds `ecosystem: <name>`, and
`ens app create` declares that ecosystem in a project that doesn't yet.

## Install a kit someone else wrote

```sh
ens kit install https://github.com/org/their-kit
ens kit install https://github.com/org/their-kit@v1.2.0
```

Clones the kit (optionally pinned to a ref with `@<ref>`) into
`.ensemble/kits/<role>/<name>`, vendored for inspection and customization —
nothing about a vendored kit is opaque or hidden behind a package registry.

## Moving a vendored kit

```sh
ens kit pin my-deploy-target v1.3.0        # move to a specific ref
ens kit update my-deploy-target            # next patch release (default)
ens kit update my-deploy-target minor      # next minor release
```

`update` looks at the kit's own tags and moves to the next release within the
given bump scope from whatever ref it's currently pinned to.

## Sharing a locally-authored kit

Once you've written a kit in-repo (via `ens kit new`) and it's ready to be
reused elsewhere:

```sh
ens kit eject my-deploy-target git@github.com:org/my-deploy-target.git
```

Pushes the kit to its own repository and registers this repo's copy as a
vendored checkout of it — from then on it's managed the same way an installed
kit is (`pin`/`update`).

## Contributing a change back

If you've made a local change to an installed (non-locally-authored) kit and
want to upstream it:

```sh
ens kit contribute my-deploy-target
```

Pushes the local change and opens a pull request against the kit's own remote.

## When a kit fails

Throw an `Error` whose message says what's wrong and what to do about it: `ens`
shows that message alone, and the kit exits 1. To see the stack and the kit's
command line as well, set `ENS_DEBUG=1`, or pass `--verbose` to a command that
has it. A kit that calls `Deno.exit` with a code of its own has that code
returned as `ens`'s.

## Full reference

See the [`ens kit` CLI reference](../reference/cli/kit.md) for every
subcommand's exact arguments.
