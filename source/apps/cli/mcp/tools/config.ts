import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as Core from "@ensemble/core";
import * as Host from "@ensemble/host";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

export class ConfigTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_config_set_build_kit",
      {
        title: "Associate an app with a build kit",
        description: "Sets build.<app>.kit in .ensemble/config.yaml.",
        inputSchema: { app: z.string(), kit: z.string() },
      },
      ({ app, kit }) =>
        ToolResult.from(async () => {
          const repoRoot = await Host.createPorts().repo.findRepoRoot();
          await new Core.Config.EnsembleConfigStore(repoRoot).setAppBuildKit(app, kit);
          return `Set build.${app}.kit = ${kit}`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_config_set_build_var",
      {
        title: "Set a personal default build var",
        description:
          "Sets a personal default build var for an app, stored in the gitignored .ensemble/config.local.yaml.",
        inputSchema: { app: z.string(), key: z.string(), value: z.string() },
      },
      ({ app, key, value }) =>
        ToolResult.from(async () => {
          const repoRoot = await Host.createPorts().repo.findRepoRoot();
          await new Core.Config.EnsembleConfigStore(repoRoot).setVar("build", app, key, value);
          return `Set local default build var ${key}=${value} for "${app}".`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_config_set_pack_var",
      {
        title: "Set a personal default pack var",
        description:
          "Sets a personal default pack var for a ship, stored in the gitignored .ensemble/config.local.yaml.",
        inputSchema: { ship: z.string(), key: z.string(), value: z.string() },
      },
      ({ ship, key, value }) =>
        ToolResult.from(async () => {
          const repoRoot = await Host.createPorts().repo.findRepoRoot();
          await new Core.Config.EnsembleConfigStore(repoRoot).setVar("pack", ship, key, value);
          return `Set local default pack var ${key}=${value} for "${ship}".`;
        }),
    );
  }
}
