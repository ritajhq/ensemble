# `ens release`

Create, resume, or undo a semver release tag — plus the ceremony that goes
with it: packing and publishing every ship a workload's `release:` section
declares, and every core library declared for publishing, then running any
configured `hooks.release.after` (e.g. a changelog update) and pushing what
they produce.

Global flags, available on every subcommand:

- `--dry-run` — preview without making changes.
- `-p, --pre-release <suffix>` — append a `-<suffix>` identifier. Ignored
  by `undo` and `resume`.
- `-m, --meta <suffix>` — append a `+<suffix>` build metadata identifier.
  Ignored by `undo` and `resume`.
- `-r, --remote <name>` — remote to push to/delete from when confirmed.
  Default: `origin`.

## `ens release next <patch|minor|major>`

Bump the version from the last tag and create a new release.

```sh
ens release next patch --dry-run
ens release next minor -p rc.1     # v1.3.0-rc.1
```

If you have uncommitted changes, you're asked to confirm before a
non-dry-run tag is created (the tag won't reflect them). Once the tag
exists, this proceeds straight into the release ceremony: it lists what it
will pack/publish, asks you to confirm once, then packs, pushes, and
publishes without asking again — a mid-ceremony failure leaves an accurate
record of what's left (`.ensemble/release/<tag>.json`) for `resume` to pick
up.

## `ens release set <version>`

Set an arbitrary version (shape `x.y.z`) and create a new release. Same
ceremony and confirmation behavior as `next`.

```sh
ens release set 2.0.0 -r upstream
```

## `ens release resume <tag>`

Re-run the ceremony for a tag that's already been created — for finishing a
release after a partial failure. Picks up exactly where it left off and
never re-runs `hooks.release.after` once it's already run for this tag.

```sh
ens release resume v1.4.2
ens release resume v1.4.2 --only web,my-lib
ens release resume v1.4.2 --skip my-lib
```

- `--only <names>` — comma-separated ship/library names to include
  (default: everything still left to do).
- `--skip <names>` — comma-separated ship/library names to exclude.

## `ens release undo`

Delete the last tag locally. Does not touch any commit.

```sh
ens release undo
ens release undo --dry-run
```

Prompts to also delete the tag from the remote once it's deleted locally.
