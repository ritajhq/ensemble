# `ens mcp`

Run an MCP server that exposes `ens`'s commands as tools for an LLM agent
host, over the stdio transport.

```sh
ens mcp
```

No flags or arguments — point your MCP-speaking host at this command
directly as a stdio server. See
[Using Ensemble with an AI agent](../../guides/using-with-agents.md) for
tool naming, discovery, and how long-running/`--watch` commands work over
MCP (they can't block a tool call the way they block a terminal).
