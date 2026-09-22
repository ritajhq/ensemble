# `ens develop`

Deploy a workload locally for development. Pure sugar for `ens deploy
<name> compose --artifacts local --emulate-externals --watch` — see
[Deploying](../../guides/deploying.md) for what each of those means, and
[Local development](../../guides/local-development.md) for the full
walkthrough.

```sh
ens develop <name>
```

- `<name>` — the workload's name, matching `ci/<name>/delivery.yml`.
- `-k, --kit <kit>` — deploy kit to use. Default: `compose`.
- `--verbose` — let the initial pack step show the kit's own build-tool
  output instead of hiding it behind the pack spinner.

```sh
ens develop web
ens develop web -k aws
```

Packs the referenced releases, brings the workload up, treats `external`
resources as auto-creatable local conveniences instead of requiring them to
already exist, and watches for source changes until you stop it with
Ctrl+C. A kit/target with no watch command (`aws`, today) surfaces an
error.
