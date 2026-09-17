import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runBuild } from "@ensemble/core";
import * as Host from "@ensemble/host";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";
import { CliArgs } from "../watch/cli-args.ts";
import { SelfInvocation } from "../watch/self-invocation.ts";
import { WatchSessionRegistry } from "../watch/watch-session-registry.ts";

export class BuildTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_build",
      {
        title: "Build an app",
        description: "Builds an app using its configured build kit.",
        inputSchema: {
          name: z.string().describe("App name, as declared under build.<name> in .ensemble/config.yaml."),
          mode: z.enum(["development", "production"]).default("development"),
          varOverrides: z.record(z.string()).optional().describe(
            "Build var overrides, keyed by name.",
          ),
        },
      },
      ({ name, mode, varOverrides }) =>
        ToolResult.from(async () => {
          const code = await runBuild(name, { mode, watch: false, varOverrides }, Host.createPorts());
          if (code !== 0) throw new Error(`Build of "${name}" failed with exit code ${code}.`);
          return `Built "${name}" (${mode}).`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_build_watch_start",
      {
        title: "Start a build in watch mode",
        description:
          "Starts `ens build <name> --watch` as a background session, rebuilding on source changes until stopped. " +
          "Returns immediately with a session id: poll ensemble_watch_logs to see rebuilds, and ensemble_watch_stop to tear it down.",
        inputSchema: {
          name: z.string().describe("App name, as declared under build.<name> in .ensemble/config.yaml."),
          mode: z.enum(["development", "production"]).default("development"),
          varOverrides: z.record(z.string()).optional().describe(
            "Build var overrides, keyed by name.",
          ),
        },
      },
      ({ name, mode, varOverrides }) =>
        ToolResult.from(() => {
          const args = [
            "build",
            name,
            "--mode",
            mode,
            "--watch",
            ...CliArgs.VarFlags("-v", varOverrides),
          ];
          const session = WatchSessionRegistry.Instance.Start(
            `build ${name} --watch`,
            SelfInvocation.Command(args),
          );
          return `Started session "${session.id}": build ${name} --watch. ` +
            `Poll ensemble_watch_logs({ id: "${session.id}" }) to see output; ` +
            `ensemble_watch_stop({ id: "${session.id}" }) to stop.`;
        }),
    );
  }
}
