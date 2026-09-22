# Using Ensemble with an AI agent

`ens mcp` runs an MCP (Model Context Protocol) server over stdio that
exposes every `ens` command as a tool an LLM agent host can call directly,
instead of shelling out to the CLI and parsing its stdout.

```sh
ens mcp
```

Point your MCP-speaking host (an editor, an agent runtime) at this command
as a stdio server. Tools are named `ensemble_<command>[_<subcommand>]`, e.g.
`ensemble_build`, `ensemble_deploy`, `ensemble_kit_install`. Each tool's
contract matches its CLI counterpart one-to-one — same arguments, same
behavior — so anything documented under
[CLI reference](../reference/cli/index.md) applies to the equivalent tool.

## Discovering names first

Most `ens`/`ensemble_*` commands take a free-text name (an app, a kit, a
workload) with no way to guess a valid value from the command alone. Call
`ensemble_status` (or run `ens status`) first: it lists every app (with its
build kit), installed kit per role, publishable library, and workload (with
its ships and declared deploy resources) this project knows about, in one
pass.

## Long-running commands: watch sessions

A `--watch` flag (`ens build --watch`, `ens pack --watch`, `ens deploy
--watch`) or `ens develop` normally blocks the terminal until you press
Ctrl+C — which doesn't fit an MCP tool call that has to return. Over MCP,
these instead start a **background watch session** and return immediately
with a session id:

- `ensemble_develop_start`, `ensemble_build_watch_start`,
  `ensemble_deploy_watch_start` — start a watch session, return its id.
- `ensemble_watch_list` — list every active watch session (id, label,
  status, exit code if it's finished).
- `ensemble_watch_logs` — read a session's output since a cursor (`after`),
  along with the next cursor to pass.
- `ensemble_watch_stop` — send SIGINT to a session, the same as Ctrl+C on
  the CLI.

An agent driving local development should start a watch session, poll
`ensemble_watch_logs` for progress, and stop it explicitly when done,
rather than treating the start call as a one-shot command.

## Why this matters for this project

Ensemble's own pitch is a workspace an agent can navigate without being
handed the whole repo — every concern has a name and a home, and kits and
delivery manifests give an agent a contract to follow instead of a guess to
make (see [Workspace layout](../concepts/workspace-layout.md)). `ens mcp`
and `ens status` are the concrete mechanism behind that pitch: discovery
and every mutating command, without an agent needing to parse CLI stdout or
grep config files by hand.
