import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runInit } from "@ensemble/core";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

export class InitTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_init",
      {
        title: "Scaffold a new Ensemble project",
        description: "Scaffolds a new Ensemble project at <name>/.",
        inputSchema: { name: z.string().describe("Directory name for the new project.") },
      },
      ({ name }) =>
        ToolResult.from(async () => {
          await runInit({ name });
          return `Scaffolded a new Ensemble project at ${name}/.`;
        }),
    );
  }
}
