import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runDeploy, runExplain } from "@ensemble/core";
import * as Host from "@ensemble/host";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";
import { SelfInvocation } from "../watch/self-invocation.ts";
import { WatchSessionRegistry } from "../watch/watch-session-registry.ts";

export class DeployTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_deploy",
      {
        title: "Deploy a workload",
        description:
          "Deploys a workload using the given deploy kit: render, then eject, plan, or apply. " +
          "Tearing a workload down is out of scope. For a long-lived --watch session, use ensemble_develop_start " +
          "(local development) or ensemble_deploy_watch_start instead.",
        inputSchema: {
          name: z.string().describe("Workload name to deploy."),
          kit: z.string().describe("Deploy kit to use."),
          artifacts: z.enum(["local", "published"]).default("published")
            .describe(
              "Which release locator to resolve.",
            ),
          version: z.string().default("latest").describe(
            "Released version to resolve ${release.<name>} references to for published artifacts.",
          ),
          termination: z.enum(["eject", "plan", "apply"]).default("apply")
            .describe(
              '"eject" renders and writes the artifact with no apply; "plan" renders and shows the intent-diff; "apply" (default) performs the deploy.',
            ),
          acceptCapabilityGaps: z.boolean().default(false).describe(
            "Proceed even if the target kit can't satisfy a requested capability (otherwise this hard-fails).",
          ),
          pack: z.boolean().default(true).describe(
            "Pack referenced releases before a local apply. Ignored for published artifacts.",
          ),
          emulateExternals: z.boolean().default(false).describe(
            "Stand up a local substitute for each declared external resource the kit knows how to emulate, instead of assuming it already exists elsewhere.",
          ),
          verbose: z.boolean().default(false).describe(
            "Include the kit's own build-tool output from the pack step instead of hiding it behind a spinner.",
          ),
        },
      },
      (
        {
          name,
          kit,
          artifacts,
          version,
          termination,
          acceptCapabilityGaps,
          pack,
          emulateExternals,
          verbose,
        },
      ) =>
        ToolResult.from(async () => {
          await runDeploy(
            name,
            kit,
            {
              artifacts,
              version,
              termination,
              acceptCapabilityGaps,
              watch: false,
              pack,
              emulateExternals,
              verbose,
            },
            Host.createPorts(),
            new Host.SubprocessPackKitGateway(),
            new Host.SubprocessKitLoader(),
          );
          return `Ran "${termination}" for "${name}" via "${kit}" (${artifacts}).`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_deploy_explain",
      {
        title: "Explain a deployed resource's resolution",
        description:
          'Explains one resource\'s resolution: which provisioner matched (and why others didn\'t), each value\'s provenance, accepted capability gaps, and resolved outputs. <resource> is "category.name" (e.g. "databases.primary").',
        inputSchema: {
          name: z.string().describe("Workload name."),
          kit: z.string().describe("Deploy kit to use."),
          resource: z.string().describe(
            'Resource to explain, as "category.name".',
          ),
          artifacts: z.enum(["local", "published"]).default("published")
            .describe(
              "Which release locator to resolve.",
            ),
          version: z.string().default("latest").describe(
            "Released version to resolve ${release.<name>} references to for published artifacts.",
          ),
        },
      },
      ({ name, kit, resource, artifacts, version }) =>
        ToolResult.from(async () => {
          await runExplain(
            name,
            kit,
            resource,
            { artifacts, version },
            Host.createPorts().repo,
            new Host.SubprocessPackKitGateway(),
            new Host.SubprocessKitLoader(),
          );
          return `Explained "${resource}" for "${name}" via "${kit}".`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_deploy_watch_start",
      {
        title: "Start a deploy in watch mode",
        description:
          "Starts `ens deploy <name> <kit> --watch` as a background session — a long-lived apply, torn down on stop. " +
          "For local development, prefer ensemble_develop_start instead. Returns immediately with a session id: " +
          "poll ensemble_watch_logs to see output, and ensemble_watch_stop to tear it down.",
        inputSchema: {
          name: z.string().describe("Workload name to deploy."),
          kit: z.string().describe("Deploy kit to use."),
          artifacts: z.enum(["local", "published"]).default("local").describe(
            "Which release locator to resolve.",
          ),
          version: z.string().default("latest").describe(
            "Released version to resolve ${release.<name>} references to for published artifacts.",
          ),
          acceptCapabilityGaps: z.boolean().default(false).describe(
            "Proceed even if the target kit can't satisfy a requested capability (otherwise this hard-fails).",
          ),
          pack: z.boolean().default(true).describe(
            "Pack referenced releases before applying. Ignored for published artifacts.",
          ),
          emulateExternals: z.boolean().default(false).describe(
            "Stand up a local substitute for each declared external resource the kit knows how to emulate, instead of assuming it already exists elsewhere.",
          ),
          verbose: z.boolean().default(false).describe(
            "Include the kit's own build-tool output from the pack step instead of hiding it behind a spinner.",
          ),
        },
      },
      (
        {
          name,
          kit,
          artifacts,
          version,
          acceptCapabilityGaps,
          pack,
          emulateExternals,
          verbose,
        },
      ) =>
        ToolResult.from(() => {
          const args = [
            "deploy",
            name,
            kit,
            "--artifacts",
            artifacts,
            "--version",
            version,
            "--watch",
            ...(acceptCapabilityGaps ? ["--accept-capability-gaps"] : []),
            ...(!pack ? ["--no-pack"] : []),
            ...(emulateExternals ? ["--emulate-externals"] : []),
            ...(verbose ? ["--verbose"] : []),
          ];
          const session = WatchSessionRegistry.Instance.Start(
            `deploy ${name} ${kit} --watch`,
            SelfInvocation.Command(args),
          );
          return `Started session "${session.id}": deploy ${name} ${kit} --watch. ` +
            `Poll ensemble_watch_logs({ id: "${session.id}" }) to see output; ` +
            `ensemble_watch_stop({ id: "${session.id}" }) to stop.`;
        }),
    );
  }
}
