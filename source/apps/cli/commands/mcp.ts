import { Command } from "@cliffy/command";
import { EnsembleMcpServer } from "../mcp/server.ts";

export const mcpCommand = new Command()
  .name("mcp")
  .description(
    "Run an MCP server that exposes ens's commands as tools for an LLM agent host (stdio transport).",
  )
  .action(async () => {
    await new EnsembleMcpServer().Start();
  });
