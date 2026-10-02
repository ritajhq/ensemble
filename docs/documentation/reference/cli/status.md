# `ens status`

List every app, kit, publishable library, and workload this project knows
about.

```sh
ens status
ens status --json
```

Gathers, in one pass:

- every app (with its build kit) from `.ensemble/config.yaml`
- every installed kit per role from `.ensemble/kits/<role>/`, marking vendored
  ones with the repository and ref from `.ensemble/vendor.lock.yml`
- every publishable library (likewise marking vendored ones)
- every workload (with its ships and declared deploy resources) from
  `ci/*/delivery.yml`

This is the discovery command: every name the other commands above expect
as an argument, without having to open any of those files by hand. Run it
first when you don't already know the exact name to pass — the equivalent
MCP tool, `ensemble_status`, says the same in its own description for an
agent host.

- `--json` — print the same survey as one JSON document instead, for
  programs: `{ version, apps, kits, libraries, workloads }`. `version` only
  changes when a field is removed or changes meaning. The editor extension's
  sidebar and the `ensemble_status` MCP tool both read this form.
