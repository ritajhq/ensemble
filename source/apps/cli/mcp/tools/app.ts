import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppCreate } from "@ensemble/core";
import * as Host from "@ensemble/host";
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
          "Scaffolds a new app under source/apps/ — or an existing app's integration for a deploy kit under source/integrations/ — with a build kit's hello-world template.",
        inputSchema: {
          kit: z.string().describe(
            'Build kit to scaffold with, e.g. "deno.bundle".',
          ),
          name: z.string().describe(
            "App name — becomes the source/apps/<name> directory.",
          ),
          target: z.string().optional().describe(
            'Static build variant to scaffold for (e.g. the react kit\'s "ssr").',
          ),
          integration: z.string().optional().describe(
            "Scaffold the app's integration for this deploy kit, at source/integrations/<integration>/<name>, instead of the app.",
          ),
        },
      },
      ({ kit, name, target, integration }) =>
        ToolResult.from(async () => {
          await runAppCreate(
            { kit, name, target, integration },
            Host.createPorts(),
          );
          const where = integration
            ? `source/integrations/${integration}/${name}`
            : `source/apps/${name}`;
          return `Scaffolded ${where} with kit "${kit}".`;
        }),
    );
  }
}
