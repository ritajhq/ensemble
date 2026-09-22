# `ens status`

List every app, kit, publishable library, and workload this project knows
about.

```sh
ens status
```

No flags or arguments. Gathers, in one pass:

- every app (with its build kit) from `.ensemble/config.yaml`
- every installed kit per role from `.ensemble/kits/<role>/`
- every publishable library
- every workload (with its ships and declared deploy resources) from
  `ci/*/delivery.yml`

This is the discovery command: every name the other commands above expect
as an argument, without having to open any of those files by hand. Run it
first when you don't already know the exact name to pass — the equivalent
MCP tool, `ensemble_status`, says the same in its own description for an
agent host.
