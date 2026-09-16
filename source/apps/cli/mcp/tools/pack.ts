import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runPack } from "@ensemble/core";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

export class PackTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_pack",
      {
        title: "Pack a ship",
        description: "Packs a ship using the given pack kit.",
        inputSchema: {
          ship: z.string().describe("Ship name to pack."),
          kit: z.string().describe("Pack kit to use."),
          mode: z.string().optional().describe(
            "Pack mode, declared by the kit's kit.yml. Defaults to its first declared mode.",
          ),
          outputName: z.string().optional().describe(
            "Name to give the packed output (e.g. an image tag). Defaults to the ship name.",
          ),
          verbose: z.boolean().default(false).describe(
            "Include the kit's own build-tool output instead of hiding it behind the pack spinner.",
          ),
          varOverrides: z.record(z.string()).optional().describe(
            "Pack var overrides, keyed by name.",
          ),
        },
      },
      ({ ship, kit, mode, outputName, verbose, varOverrides }) =>
        ToolResult.from(async () => {
          const code = await runPack(ship, kit, {
            mode,
            outputName,
            watch: false,
            verbose,
            varOverrides,
          });
          if (code !== 0) {
            throw new Error(`Packing "${ship}" via "${kit}" failed with exit code ${code}.`);
          }
          return `Packed "${ship}" via "${kit}".`;
        }),
    );
  }
}
