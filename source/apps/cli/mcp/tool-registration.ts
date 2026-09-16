import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ShapeOutput, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface ToolConfig<Shape extends ZodRawShapeCompat> {
  title: string;
  description: string;
  inputSchema: Shape;
}

/**
 * Thin wrapper around `McpServer.registerTool`. The SDK's own signature has
 * two independent type parameters — one for the input schema, one for the
 * (here always absent) output schema — and the output one has no default,
 * which defeats inference for the input shape too and leaves every
 * handler's arguments implicitly `any`. Fixing the input shape as this
 * class's only type parameter restores inference at every call site
 * without an explicit generic at each one.
 */
export class ToolRegistration {
  static Register<Shape extends ZodRawShapeCompat>(
    server: McpServer,
    name: string,
    config: ToolConfig<Shape>,
    handler: (args: ShapeOutput<Shape>) => CallToolResult | Promise<CallToolResult>,
  ): void {
    (server.registerTool as (
      name: string,
      config: unknown,
      handler: unknown,
    ) => unknown)(name, config, handler);
  }
}
