# Instructions for Claude in this repository

Start with [docs/agent-context.md](docs/agent-context.md) for the repo's mental
model, and [README.md](README.md) for the user-facing pitch and command
reference.

`ens mcp` also exposes every CLI command as an MCP tool (`ensemble_build`,
`ensemble_deploy`, ...) for a host that speaks MCP — same contract as the CLI,
just callable directly instead of shelled out to.

## How this repo expects work to be done

Prefer `deno fmt`, `deno lint`, and `deno check` on the files you touched, and
build with `deno task cli build <app>` — the smallest command that covers the
change. `deno test` type-checks by default; don't reach for `--no-check` to
make a failure go away without understanding it first.

Commit messages are a single summary line — no body, no trailers (see
[docs/agent-context.md](docs/agent-context.md#commit-scope-conventions) for
the scope convention).

Don't add tests, harnesses, or screenshots the user didn't ask for.
