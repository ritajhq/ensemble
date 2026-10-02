import type { Spawned } from "./terminate-children-on-signal.ts";

/**
 * A long-running child process (`deno bundle --watch`, `tailwindcss
 * --watch=always`) that can be swapped for a fresh one when something it
 * only reads at startup changes underneath it — a watcher that never reloads
 * its own config otherwise keeps running against the stale one, failing every
 * rebuild without ever exiting.
 *
 * Itself a `Spawned`, so `terminateChildrenOnSignal` tears down whichever
 * process is current at signal time, and awaiting it resolves with the exit
 * code of the first process that exits for any reason other than `restart`.
 */
export class RestartableChild implements Spawned {
  private current: Spawned;
  private stopped = false;
  private readonly exit: Promise<{ code: number }>;
  private settle!: (result: { code: number }) => void;

  constructor(private readonly spawn: () => Spawned) {
    this.exit = new Promise((resolve) => this.settle = resolve);
    this.current = this.start();
  }

  /** Kills the current process and starts a fresh one in its place. */
  restart(): void {
    if (this.stopped) return;
    const previous = this.current;
    this.current = this.start();
    killQuietly(previous);
  }

  kill(signo?: Deno.Signal): void {
    this.stopped = true;
    killQuietly(this.current, signo);
  }

  then<TResult1 = { code: number }, TResult2 = never>(
    onfulfilled?:
      | ((value: { code: number }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.exit.then(onfulfilled, onrejected);
  }

  private start(): Spawned {
    const child = this.spawn();
    child.then((result) => {
      if (child !== this.current) return;
      this.stopped = true;
      this.settle(result);
    });
    return child;
  }
}

function killQuietly(child: Spawned, signo?: Deno.Signal): void {
  try {
    child.kill(signo);
  } catch {
    // Already exited on its own — nothing to tear down.
  }
}
