import { dirname, join } from "@std/path";
import { ProcessTree } from "./process-tree.ts";

const GRACE_POLLS = 20;
const GRACE_POLL_MS = 250;

/**
 * Remembers the process a watch session spawned, in a file under the
 * deployment's own `.ensemble/deploy/<name>` directory, so the *next* session can clean up after one that
 * never got to tear its child down (SIGKILL, a crash, the machine losing
 * power) — the one case in-process teardown can't cover. Without it the
 * orphan keeps holding the compose project's exclusive `watch` lock and every
 * later session fails with "cannot take exclusive lock".
 *
 * Everything here is best-effort: a record that can't be read or written
 * only costs that recovery, never the session itself.
 */
export class WatchSessionRecord {
  constructor(private readonly path: string) {}

  static for(repoRoot: string, name: string): WatchSessionRecord {
    return new WatchSessionRecord(
      join(repoRoot, ".ensemble", "deploy", name, "watch-session"),
    );
  }

  /** Stops the watch process a previous session left running, if the record names one that is still alive and still running `args` (a recycled PID is left alone). Returns its PID when it stopped one. */
  async reclaimStale(args: readonly string[]): Promise<number | undefined> {
    const pid = await this.recordedPid();
    if (pid === undefined) return undefined;

    const tree = new ProcessTree(pid);
    const running = tree.commandLine();
    await this.end();
    if (!running?.endsWith(args.join(" "))) return undefined;

    tree.terminate();
    for (let poll = 0; poll < GRACE_POLLS; poll++) {
      if (!tree.isRunning()) return pid;
      await new Promise((resolve) => setTimeout(resolve, GRACE_POLL_MS));
    }
    tree.kill();
    return pid;
  }

  async begin(pid: number): Promise<void> {
    try {
      await Deno.mkdir(dirname(this.path), { recursive: true });
      await Deno.writeTextFile(this.path, `${pid}\n`);
    } catch {
      // Recovery from a crash is lost; the session itself is unaffected.
    }
  }

  async end(): Promise<void> {
    try {
      await Deno.remove(this.path);
    } catch {
      // Nothing recorded.
    }
  }

  private async recordedPid(): Promise<number | undefined> {
    try {
      const pid = Number.parseInt(await Deno.readTextFile(this.path), 10);
      return Number.isInteger(pid) && pid > 0 ? pid : undefined;
    } catch {
      return undefined;
    }
  }
}
