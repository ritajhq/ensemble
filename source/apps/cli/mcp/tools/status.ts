import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runStatus } from "@ensemble/core";
import * as Host from "@ensemble/host";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

export class StatusTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_status",
      {
        title: "List this project's apps, kits, libraries, and workloads",
        description:
          "Lists every app (with its build kit), installed kit per role, publishable library, and " +
          "workload (with its ships and declared deploy resources) this project knows about — the " +
          "names every other ensemble_* tool expects as an argument. Call this first when you don't " +
          "already know the exact name to pass.",
        inputSchema: {},
      },
      () =>
        ToolResult.from(async () => {
          await runStatus(Host.createPorts());
          return "(end of status)";
        }),
    );
  }
}
