import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ConsoleCapture } from "./console-capture.ts";

/**
 * Builds the MCP tool-call result shape, folding in whatever the action
 * narrated through console.log along the way (see `ConsoleCapture`) and
 * translating a thrown error into an `isError` result — so each tool
 * handler only has to describe its own success text.
 */
export class ToolResult {
  static text(message: string): CallToolResult {
    return { content: [{ type: "text", text: message }] };
  }

  static async from(action: () => string | Promise<string>): Promise<CallToolResult> {
    ConsoleCapture.reset();
    try {
      const summary = await action();
      return ToolResult.text(ConsoleCapture.join(summary));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: ConsoleCapture.join(message) }],
        isError: true,
      };
    } finally {
      ConsoleCapture.reset();
    }
  }
}
