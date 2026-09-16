import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConsoleCapture } from "./console-capture.ts";
import * as Tools from "./tools/index.ts";

interface ToolRegistrar {
  Register(server: McpServer): void;
}

const TOOL_REGISTRARS: (new () => ToolRegistrar)[] = [
  Tools.InitTools,
  Tools.AppTools,
  Tools.BuildTools,
  Tools.PackTools,
  Tools.PublishTools,
  Tools.DeployTools,
  Tools.DevelopTools,
  Tools.WatchTools,
  Tools.ConfigTools,
  Tools.KitTools,
  Tools.LibTools,
  Tools.ReleaseTools,
];

/** Exposes `ens`'s commands as MCP tools over stdio, for an LLM agent host (e.g. an editor's MCP client) to call directly instead of shelling out to the CLI. */
export class EnsembleMcpServer {
  private readonly server = new McpServer({ name: "ensemble", version: "0.1.0" });

  constructor() {
    for (const Registrar of TOOL_REGISTRARS) {
      new Registrar().Register(this.server);
    }
  }

  async Start(): Promise<void> {
    ConsoleCapture.Install();
    await this.server.connect(new StdioServerTransport());
  }
}
