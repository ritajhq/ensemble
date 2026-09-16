import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";
import { WatchSessionRegistry } from "../watch/watch-session-registry.ts";

export class WatchTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_watch_list",
      {
        title: "List active watch sessions",
        description:
          "Lists every background watch session started by ensemble_develop_start, ensemble_build_watch_start, or ensemble_deploy_watch_start.",
        inputSchema: {},
      },
      () =>
        ToolResult.from(() => {
          const sessions = WatchSessionRegistry.Instance.List();
          if (sessions.length === 0) return "No active watch sessions.";
          return sessions.map((session) =>
            `${session.id} — ${session.label} (${session.status}${
              session.exitCode !== undefined ? `, exit ${session.exitCode}` : ""
            })`
          ).join("\n");
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_watch_logs",
      {
        title: "Read a watch session's output",
        description:
          "Returns the lines a watch session has produced since `after` (omit or pass 0 for its full history so far), plus a cursor to pass next time.",
        inputSchema: {
          id: z.string().describe("Session id, from ensemble_develop_start or ensemble_watch_list."),
          after: z.number().int().min(0).default(0).describe(
            "Cursor from a previous call; 0 for the full history so far.",
          ),
        },
      },
      ({ id, after }) =>
        ToolResult.from(() => {
          const session = WatchSessionRegistry.Instance.Get(id);
          const { lines, cursor } = session.logsSince(after);
          const body = lines.length > 0 ? lines.join("\n") : "(no new output)";
          return `${body}\n\n[status: ${session.status}, cursor: ${cursor}]`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_watch_stop",
      {
        title: "Stop a watch session",
        description: "Sends SIGINT to a watch session's process — the same as Ctrl+C on the CLI.",
        inputSchema: { id: z.string().describe("Session id to stop.") },
      },
      ({ id }) =>
        ToolResult.from(() => {
          const session = WatchSessionRegistry.Instance.Get(id);
          session.stop();
          return `Stopping "${id}" (${session.label}).`;
        }),
    );
  }
}
