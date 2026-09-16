import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";
import { SelfInvocation } from "../watch/self-invocation.ts";
import { WatchSessionRegistry } from "../watch/watch-session-registry.ts";

export class DevelopTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_develop_start",
      {
        title: "Start a local dev deploy (watch mode)",
        description:
          "Starts `ens develop <name>` as a background session — deploys locally with --emulate-externals --watch, " +
          "rebuilding and syncing on source changes until stopped. Returns immediately with a session id: " +
          "poll ensemble_watch_logs to see the live rebuild/sync as you edit code, and ensemble_watch_stop to tear it down.",
        inputSchema: {
          name: z.string().describe("Workload name to develop."),
          kit: z.string().default("compose").describe("Deploy kit to use."),
          verbose: z.boolean().default(false).describe(
            "Include the kit's own build-tool output from the initial pack step.",
          ),
        },
      },
      ({ name, kit, verbose }) =>
        ToolResult.from(() => {
          const args = ["develop", name, "--kit", kit, ...(verbose ? ["--verbose"] : [])];
          const session = WatchSessionRegistry.Instance.Start(
            `develop ${name}`,
            SelfInvocation.Command(args),
          );
          return `Started session "${session.id}": develop ${name} (kit ${kit}). ` +
            `Poll ensemble_watch_logs({ id: "${session.id}" }) to see output; ` +
            `ensemble_watch_stop({ id: "${session.id}" }) to stop.`;
        }),
    );
  }
}
