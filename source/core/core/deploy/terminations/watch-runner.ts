import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { Kit } from "../kit/kit.ts";
import type { ArtifactSink } from "./artifact-sink.ts";

/** Thrown when `--watch` is requested but the target's kit has no watch command for it — a capability gap, not a bug: the manifest and target are both valid, this target's runtime just can't watch. */
export class WatchNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchNotSupportedError";
  }
}

/**
 * The watch terminal step (Section 8): a long-lived sibling of `apply` —
 * presents and writes the artifact exactly as `Applier` does, then runs the
 * kit's own watch command in the foreground until torn down, instead of a
 * one-shot spawn-and-await. `eject`/`plan` never reach this; the coordinator
 * only invokes it for a watch-requested apply, after the Phase 4 pack step.
 *
 * Teardown is driven by an `AbortSignal` rather than a literal SIGINT
 * handler baked in here: production callers omit `signal` and get a real
 * `Deno.addSignalListener("SIGINT", ...)` hookup (installed here, since
 * kit-sdk already spawns processes directly via `Deno.Command` — `Applier`
 * does the same, no `@ensemble/core`/dax dependency needed for that); tests
 * inject their own `AbortController` to simulate Ctrl+C without touching the
 * test process's real signal handling. Using the web-standard `AbortSignal`
 * (not dax's `KillSignalController` directly) is what lets a future
 * rebuild-on-change coordinator (the reserved companion-watcher seam) share
 * one signal across both this and `runBuild`'s own `RunBuildOptions.signal`
 * in `@ensemble/core`, without kit-sdk ever depending on dax.
 */
export class WatchRunner {
  constructor(private readonly sink: ArtifactSink) {}

  async watch(
    artifacts: Artifacts,
    graph: DependencyGraph,
    kit: Kit,
    name: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const presented = await kit.present(artifacts, graph);
    await this.sink.write(presented);

    const command = await kit.watchCommand?.(this.sink.pathFor(presented), name);
    if (!command) {
      throw new WatchNotSupportedError(
        "This kit has no watch command for the current target — pick a runtime/target that supports watching.",
      );
    }

    const [executable, ...args] = command;
    const process = new Deno.Command(executable, { args }).spawn();
    const teardown = () => {
      try {
        process.kill("SIGTERM");
      } catch {
        // Already exited on its own — nothing to tear down.
      }
    };

    if (signal) {
      signal.addEventListener("abort", teardown, { once: true });
      if (signal.aborted) teardown();
      await process.status;
      return;
    }

    const onSigint = () => teardown();
    Deno.addSignalListener("SIGINT", onSigint);
    try {
      await process.status;
    } finally {
      Deno.removeSignalListener("SIGINT", onSigint);
    }
  }
}
