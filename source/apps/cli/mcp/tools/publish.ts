import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runPublish } from "@ensemble/core";
import * as Host from "@ensemble/host";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

export class PublishTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_publish",
      {
        title: "Publish a packed ship",
        description: "Publishes a previously packed ship using the given pack kit.",
        inputSchema: {
          ship: z.string().describe("Ship name to publish."),
          kit: z.string().describe("Pack kit that produced the artifact."),
          target: z.string().describe(
            "Named publish target, declared in the pack kit's kit.yml.",
          ),
          outputName: z.string().optional().describe(
            "Name of the local packed artifact to publish. Defaults to the ship name.",
          ),
          version: z.string().default("latest").describe(
            "Version to publish this artifact under, alongside its :latest tag.",
          ),
          varOverrides: z.record(z.string()).optional().describe(
            "Publish var overrides, keyed by name.",
          ),
        },
      },
      ({ ship, kit, target, outputName, version, varOverrides }) =>
        ToolResult.from(async () => {
          const code = await runPublish(ship, kit, {
            target,
            outputName,
            version,
            varOverrides,
          }, Host.createPorts());
          if (code !== 0) {
            throw new Error(
              `Publishing "${ship}" to "${target}" failed with exit code ${code}.`,
            );
          }
          return `Published "${ship}" to "${target}" @ ${version}.`;
        }),
    );
  }
}
