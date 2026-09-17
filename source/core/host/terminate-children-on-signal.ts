/**
 * A dax `$\`cmd\`.spawn()` child: kill()able, and awaitable (via `PromiseLike`)
 * for its exit result — dax's own shape, not `Deno.Command`'s (which exposes
 * a separate `.status` property instead of being directly awaitable).
 */
export interface Spawned extends PromiseLike<{ code: number }> {
  kill(signo?: Deno.Signal): void;
}

/**
 * Installs SIGINT/SIGTERM listeners that kill every one of `children` — a
 * build kit's own spawned tools (`deno bundle --watch`, a standalone binary
 * like Tailwind's) — before this process's own termination handling (or lack
 * of it) leaves them behind. Without this, a signal that kills only this
 * kit's own process (not its process group — `runBuild`'s own kill signal
 * never reaches further than the one process it spawned, and some
 * environments, e.g. certain devcontainer/remote setups, don't broadcast a
 * real Ctrl+C to the whole group either) orphans these children: reparented,
 * still watching, running until something else eventually kills them or they
 * crash on their own (a standalone tool's own runtime hitting an I/O error
 * on a now-dangling file descriptor, sometimes much later and looking
 * completely disconnected from anything currently running).
 */
export function terminateChildrenOnSignal(children: readonly Spawned[]): void {
  const kill = () => {
    for (const child of children) {
      try {
        child.kill();
      } catch {
        // Already exited on its own — nothing to tear down.
      }
    }
  };
  Deno.addSignalListener("SIGINT", kill);
  Deno.addSignalListener("SIGTERM", kill);
}
