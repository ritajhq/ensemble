# CLI reference

Every top-level `ens` command, as registered in `source/apps/cli/main.ts`:

| Command                   | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| [`init`](init.md)         | Scaffold a new Ensemble project.                           |
| [`app`](app.md)           | Manage apps under `source/apps/`.                          |
| [`kit`](kit.md)           | Author, install, and manage kits under `.ensemble/kits/`.  |
| [`lib`](lib.md)           | Manage libraries under `source/libs/`.                     |
| [`build`](build.md)       | Build an app using its configured kit.                     |
| [`pack`](pack.md)         | Pack a ship using the given pack kit.                      |
| [`publish`](publish.md)   | Publish a previously packed ship.                          |
| [`deploy`](deploy.md)     | Deploy a workload using the given deploy kit.              |
| [`delivery`](delivery.md) | Run a task declared by a deployed workload.                |
| [`develop`](develop.md)   | Deploy a workload locally for development.                 |
| [`config`](config.md)     | Manage `.ensemble/config.yaml`.                            |
| [`release`](release.md)   | Create, resume, or undo a semver release.                  |
| [`status`](status.md)     | List every app, kit, library, and workload.                |
| [`mcp`](mcp.md)           | Run an MCP server exposing every command as an agent tool. |
| [`version`](version.md)   | Show or change the installed `ens` version.                |

Every command is also available as an MCP tool when running `ens mcp` — see
[Using Ensemble with an AI agent](../../guides/using-with-agents.md).
