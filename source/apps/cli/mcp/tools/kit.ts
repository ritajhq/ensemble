import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  runKitContribute,
  runKitEject,
  runKitInstall,
  runKitNew,
  runKitPin,
  runKitUpdate,
} from "@ensemble/core";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

const ROLE = z.enum(["build", "pack", "deploy", "lib"]);
const BUMP = z.enum(["patch", "minor", "major"]);

export class KitTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_kit_new",
      {
        title: "Scaffold a new kit",
        description: "Scaffolds a new kit at .ensemble/kits/<role>/<name>.",
        inputSchema: { name: z.string(), role: ROLE },
      },
      ({ name, role }) =>
        ToolResult.from(async () => {
          await runKitNew(name, role);
          return `Scaffolded .ensemble/kits/${role}/${name}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_kit_install",
      {
        title: "Install a kit",
        description:
          'Clones a kit from a git repository (optionally "<url>@<ref>") into .ensemble/kits/<role>/<name>.',
        inputSchema: { url: z.string() },
      },
      ({ url }) =>
        ToolResult.from(async () => {
          const entry = await runKitInstall(url);
          return `Installed kit at ${entry.path} (${entry.repo}@${entry.ref}).`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_kit_eject",
      {
        title: "Eject a locally-authored kit",
        description:
          "Pushes a locally-authored kit to its own repository and registers it as a vendored checkout.",
        inputSchema: { name: z.string(), remote: z.string() },
      },
      ({ name, remote }) =>
        ToolResult.from(async () => {
          const entry = await runKitEject(name, remote);
          return `Ejected ${entry.path} to ${entry.repo}@${entry.ref}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_kit_pin",
      {
        title: "Pin an installed kit",
        description: "Moves an installed kit's checkout to a different ref.",
        inputSchema: { name: z.string(), ref: z.string() },
      },
      ({ name, ref }) =>
        ToolResult.from(async () => {
          const entry = await runKitPin(name, ref);
          return `Pinned ${entry.path} to ${entry.repo}@${entry.ref}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_kit_update",
      {
        title: "Update an installed kit",
        description:
          "Moves an installed kit to its next patch/minor/major tag (defaults to patch).",
        inputSchema: { name: z.string(), bump: BUMP.optional() },
      },
      ({ name, bump }) =>
        ToolResult.from(async () => {
          const entry = await runKitUpdate(name, bump);
          return `Updated ${entry.path} to ${entry.repo}@${entry.ref}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_kit_contribute",
      {
        title: "Contribute an installed kit's local change upstream",
        description:
          "Pushes an installed kit's local change upstream and opens a PR against its remote.",
        inputSchema: { name: z.string() },
      },
      ({ name }) =>
        ToolResult.from(async () => {
          const pr = await runKitContribute(name);
          return `Opened pull request: ${pr.url}`;
        }),
    );
  }
}
