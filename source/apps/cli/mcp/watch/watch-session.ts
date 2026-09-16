export type WatchSessionStatus = "running" | "exited";

/**
 * One long-lived `ens ... --watch` (or `ens develop`) session, spawned as a
 * real OS process rather than run in-process. That's not incidental:
 * `runDeploy`'s watch mode tears itself down via a process-wide
 * `Deno.addSignalListener("SIGINT", ...)`, not a cancelable `AbortSignal` —
 * so run in-process, the only way to stop one session would be to send
 * SIGINT to the whole `ens mcp` server. Spawning it as its own process
 * means `stop()` can target just that process.
 */
export class WatchSession {
  readonly startedAt = new Date();
  status: WatchSessionStatus = "running";
  stopRequested = false;
  exitCode?: number;

  private readonly process: Deno.ChildProcess;
  private readonly lines: string[] = [];

  constructor(readonly id: string, readonly label: string, command: readonly string[]) {
    const [cmd, ...args] = command;
    this.process = new Deno.Command(cmd, {
      args,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    this.pump(this.process.stdout);
    this.pump(this.process.stderr);
    this.process.status.then((status) => {
      this.status = "exited";
      this.exitCode = status.code;
    });
  }

  private async pump(stream: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let carry = "";
    for await (const chunk of stream) {
      const text = carry + decoder.decode(chunk, { stream: true });
      const parts = text.split("\n");
      carry = parts.pop() ?? "";
      this.lines.push(...parts);
    }
    if (carry) this.lines.push(carry);
  }

  /** Lines produced after `afterLine` (0 for the full history so far), and the cursor to pass on the next call. */
  logsSince(afterLine: number): { lines: string[]; cursor: number } {
    return { lines: this.lines.slice(afterLine), cursor: this.lines.length };
  }

  stop(): void {
    this.stopRequested = true;
    if (this.status === "running") this.process.kill("SIGINT");
  }
}
