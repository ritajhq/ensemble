import { ProcessTree } from "../deploy/terminations/process-tree.ts";
import type { Runnable } from "./values.ts";

/** One launch entry's program, started. */
export class Running {
  private constructor(
    readonly runnable: Runnable,
    private readonly child: Deno.ChildProcess,
  ) {}

  static start(runnable: Runnable, cwd: string): Running {
    const [program, ...args] = runnable.argv;
    const child = new Deno.Command(program, {
      args,
      cwd,
      env: runnable.env,
      stdin: "null",
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
    return new Running(runnable, child);
  }

  /** Resolves, with the exit code, when the program ends for any reason. */
  get exited(): Promise<number> {
    return this.child.status.then((status) => status.code);
  }

  get pid(): number {
    return this.child.pid;
  }

  /** Asks the program and what it spawned to stop, and waits until it has; force-kills after `graceMs`. */
  async stop(graceMs = 3000): Promise<void> {
    const tree = new ProcessTree(this.child.pid);
    tree.terminate();
    const timer = setTimeout(() => tree.kill(), graceMs);
    try {
      await this.child.status;
    } finally {
      clearTimeout(timer);
    }
  }
}
