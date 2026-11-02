# `ens build`

Build an app using its configured kit.

```sh
ens build <name>
```

- `<name>` — the app's name under `source/apps/` (e.g. `web`, or `my_app/server`
  for a nested app).
- `-m, --mode <development|production>` — build mode. Default: `development`.
- `-w, --watch` — rebuild on source changes instead of exiting after one build.
- `-v, --var <KEY=VALUE>` — override a build var for this run only. Repeatable.
  Resolution order (highest wins): `-v` flags → `ens config set-build-var`
  defaults → the kit's own configured fallbacks.

Output is written to `source/artifacts/<name>`.

An app whose build reads the output of another build, or of a pack, says so with
`needs:`. See [`ens pack`](pack.md#needs) for the full form.

```sh
ens build web -m production
ens build web -w
ens build web -v API_URL=https://staging.example.com -v DEBUG=true
```
