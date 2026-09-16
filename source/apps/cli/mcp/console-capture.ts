/**
 * MCP's stdio transport reserves stdout exclusively for JSON-RPC frames, but
 * the wrapped run* functions communicate through plain console.log calls —
 * build/pack progress lines, release ceremony narration, and for
 * `runExplain` the entire result. Rather than discarding that to stderr,
 * this redirects it into an in-memory buffer that `ToolResult` folds into
 * the tool call's response text — never onto real stdout.
 *
 * Assumes one tool call is in flight at a time, which holds for every MCP
 * client this repo targets (each awaits a call before sending the next) —
 * concurrent calls would interleave into the same buffer.
 */
export class ConsoleCapture {
  private static buffer: string[] = [];
  private static installed = false;

  static Install(): void {
    if (ConsoleCapture.installed) return;
    ConsoleCapture.installed = true;
    const capture = (...args: unknown[]) => {
      ConsoleCapture.buffer.push(args.map(String).join(" "));
    };
    console.log = capture;
    console.info = capture;
    console.debug = capture;
    console.warn = capture;
  }

  static reset(): void {
    ConsoleCapture.buffer = [];
  }

  /** Prefixes `summary` with whatever's been captured since the last reset. */
  static join(summary: string): string {
    return ConsoleCapture.buffer.length > 0
      ? `${ConsoleCapture.buffer.join("\n")}\n\n${summary}`
      : summary;
  }
}
