# `ens develop`

Deploy a workload locally for development. Pure sugar for
`ens deploy
<name> <kit> --mode development --artifacts local --emulate-externals --watch`
— see [Deploying](../../guides/deploying.md) for what each of those means, and
[Local development](../../guides/local-development.md) for the full walkthrough.

```sh
ens develop <name>
```

- `<name>` — the workload's name, matching `ci/<name>/delivery.yml`.
- `-k, --kit <kit>` — deploy kit to use. Default: the one `deploy.<name>.kit` in
  `.ensemble/config.yaml` names (see [`ens deploy`](deploy.md)), else `compose`.
- `--verbose` — let the initial pack step show the kit's own build-tool output
  instead of hiding it behind the pack spinner.
- `--env-file <path>` — load an env file (repo-root relative or absolute,
  repeatable) instead of the defaults: `ci/<name>/dev.env`,
  `ci/<name>/<kit>.env` for the kit deploying (values only its local target
  needs), and the untracked `.ensemble/deploy/<name>/secrets.env`, each read
  only if it exists.

```sh
ens develop web
ens develop web -k aws
```

Packs the referenced releases, brings the workload up, treats `external`
resources as auto-creatable local conveniences instead of requiring them to
already exist, and watches for source changes until you stop it with Ctrl+C. A
kit/target with no watch command surfaces an error. With `aws`, the watch keeps
each `function` and `object-storage` bucket that declares `development.sync`
current with its apps' build output.

A workload with a resource the kit has no provisioner for (a `function` on
compose, say) fails naming the kit it tried — usually a sign the workload needs
`-k` or a `deploy.<name>.kit` entry.
