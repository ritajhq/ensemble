import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppCreate } from "@ensemble/core";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

export class AppTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_app_create",
      {
        title: "Scaffold a new app",
        description:
          "Scaffolds a new app under source/apps/ with a build kit's hello-world template.",
        inputSchema: {
          kit: z.string().describe('Build kit to scaffold with, e.g. "deno.bundle".'),
          name: z.string().describe("App name — becomes the source/apps/<name> directory."),
          target: z.string().optional().describe(
            'Static build variant to scaffold for (e.g. the react kit\'s "ssr").',
          ),
        },
      },
      ({ kit, name, target }) =>
        ToolResult.from(async () => {
          await runAppCreate({ kit, name, target });
          return `Scaffolded source/apps/${name} with kit "${kit}".`;
        }),
    );
  }
}
