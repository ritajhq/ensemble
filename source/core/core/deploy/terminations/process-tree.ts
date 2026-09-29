/**
 * A running OS process and whatever it spawned, addressed by PID. Exists
 * because a CLI like `docker compose` hands its real work to a plugin child
 * and doesn't reliably pass a SIGTERM on to it — signalling only the PID we
 * spawned can leave the actual worker running.
 */
export class ProcessTree {
  constructor(private readonly pid: number) {}

  /** SIGTERM to the direct children first, while they're still reachable through this process, then to the process itself. Never throws — whatever already exited needs no teardown. */
  terminate(): void {
    this.signalChildren("SIGTERM");
    this.signal("SIGTERM");
  }

  /** SIGKILL, same order as `terminate()`. */
  kill(): void {
    this.signalChildren("SIGKILL");
    this.signal("SIGKILL");
  }

  /** The command line the process is running, or `undefined` when it isn't running (or `ps` is unavailable). */
  commandLine(): string | undefined {
    try {
      const { code, stdout } = new Deno.Command("ps", {
        args: ["-p", `${this.pid}`, "-o", "args="],
      }).outputSync();
      if (code !== 0) return undefined;
      return new TextDecoder().decode(stdout).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /** Whether the process is still running. */
  isRunning(): boolean {
    return this.commandLine() !== undefined;
  }

  private signalChildren(signo: "SIGTERM" | "SIGKILL"): void {
    try {
      new Deno.Command("pkill", { args: [`-${signo}`, "-P", `${this.pid}`] })
        .outputSync();
    } catch {
      // No `pkill` here, or no children to signal.
    }
  }

  private signal(signo: "SIGTERM" | "SIGKILL"): void {
    try {
      Deno.kill(this.pid, signo);
    } catch {
      // Already exited on its own.
    }
  }
}
