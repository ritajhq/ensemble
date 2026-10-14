# `ens publish`

Publish a previously packed ship using the given pack kit.

```sh
ens publish <ship> <kit> <target>
```

- `<ship>` — the ship to publish.
- `<kit>` — the pack kit that packed it.
- `<target>` — a target the pack kit supports (e.g. `push` for the `docker` kit,
  which retags the local image to its configured registry and pushes it).
- `-o, --output-name <name>` — name of the local packed artifact to publish.
  Defaults to the ship name.
- `--version <version>` — version to publish this artifact under, alongside its
  `:latest` tag. Default: `latest`.
- `-v, --var <KEY=VALUE>` — override a publish var for this run only.
  Repeatable.

```sh
ens publish web docker push
ens publish web docker push --version 1.2.3
```

Before publishing, the pack kit's `authorize.ts` checks that this machine may
publish to `<target>`, with the same arguments and credentials
(`.ensemble/release/secrets.env`) `publish.ts` would use. If it refuses, or the
kit has no `authorize.ts`, nothing is published and the command fails with the
kit's reason. See
[`ens release` — Publish authorization](release.md#publish-authorization) for
what each bundled kit checks.
