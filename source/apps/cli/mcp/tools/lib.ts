import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  runLibContribute,
  runLibEject,
  runLibInstall,
  runLibNew,
  runLibPin,
  runLibPublish,
  runLibUpdate,
} from "@ensemble/core";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

const BUMP = z.enum(["patch", "minor", "major"]);

export class LibTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_lib_new",
      {
        title: "Scaffold a new library",
        description: "Scaffolds a new library at source/libs/<name>.",
        inputSchema: { name: z.string() },
      },
      ({ name }) =>
        ToolResult.from(async () => {
          await runLibNew(name);
          return `Scaffolded source/libs/${name}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_lib_install",
      {
        title: "Install a library",
        description:
          'Clones a lib from a git repository (optionally "<url>@<ref>") into source/libs/<name>.',
        inputSchema: { url: z.string() },
      },
      ({ url }) =>
        ToolResult.from(async () => {
          const entry = await runLibInstall(url);
          return `Installed lib at ${entry.path} (${entry.repo}@${entry.ref}).`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_lib_eject",
      {
        title: "Eject a library",
        description:
          "Pushes source/libs/<name> to its own repository and registers it as a vendored checkout.",
        inputSchema: { name: z.string(), remote: z.string() },
      },
      ({ name, remote }) =>
        ToolResult.from(async () => {
          const entry = await runLibEject(name, remote);
          return `Ejected ${entry.path} to ${entry.repo}@${entry.ref}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_lib_pin",
      {
        title: "Pin a vendored library",
        description: "Moves a vendored lib's checkout to a different ref.",
        inputSchema: { name: z.string(), ref: z.string() },
      },
      ({ name, ref }) =>
        ToolResult.from(async () => {
          const entry = await runLibPin(name, ref);
          return `Pinned ${entry.path} to ${entry.repo}@${entry.ref}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_lib_update",
      {
        title: "Update a vendored library",
        description:
          "Moves a vendored lib to its next patch/minor/major tag (defaults to patch).",
        inputSchema: { name: z.string(), bump: BUMP.optional() },
      },
      ({ name, bump }) =>
        ToolResult.from(async () => {
          const entry = await runLibUpdate(name, bump);
          return `Updated ${entry.path} to ${entry.repo}@${entry.ref}.`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_lib_contribute",
      {
        title: "Contribute a vendored library's local change upstream",
        description: "Pushes a vendored lib's local change upstream and opens a PR against its remote.",
        inputSchema: { name: z.string() },
      },
      ({ name }) =>
        ToolResult.from(async () => {
          const pr = await runLibContribute(name);
          return `Opened pull request: ${pr.url}`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_lib_publish",
      {
        title: "Publish a library",
        description:
          "Publishes source/libs/<name> through one of its declared kits, outside ens release.",
        inputSchema: { name: z.string(), kit: z.string(), version: z.string() },
      },
      ({ name, kit, version }) =>
        ToolResult.from(async () => {
          await runLibPublish(name, kit, version);
          return `Published ${name} via ${kit} @ ${version}.`;
        }),
    );
  }
}
