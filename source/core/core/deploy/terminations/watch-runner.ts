import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { Kit } from "../kit/kit.ts";
import type { ArtifactSink } from "./artifact-sink.ts";
import type { OutputsLedger } from "../render/outputs-ledger.ts";
import type { DeployedState } from "./deployed-state.ts";
import { InitRunner } from "./init-runner.ts";
import { ProcessTree } from "./process-tree.ts";
import { WatchSessionRecord } from "./watch-session-record.ts";

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
 *
 * A watch session is an apply, so the render pass's own init commands run here
 * too (`InitRunner`) — once the watch command has been spawned, since bringing
 * the stack up is exactly what that command does, and every init command is
 * free to poll until whatever it seeds is actually reachable.
 */
export class WatchRunner {
  constructor(
    private readonly sink: ArtifactSink,
    private readonly initRunner: InitRunner = new InitRunner(),
    private readonly deployed?: DeployedState,
    private readonly session?: WatchSessionRecord,
  ) {}

  async watch(
    artifacts: Artifacts,
    graph: DependencyGraph,
    kit: Kit,
    name: string,
    signal?: AbortSignal,
    ledger?: OutputsLedger,
  ): Promise<void> {
    const presented = await kit.present(artifacts, graph);
    await this.sink.write(presented);

    const artifactPath = this.sink.pathFor(presented);
    const command = await kit.watchCommand?.(artifactPath, name);
    if (!command) {
      throw new WatchNotSupportedError(
        "This kit has no watch command for the current target — pick a runtime/target that supports watching.",
      );
    }

    const [executable, ...args] = command;
    const reclaimed = await this.session?.reclaimStale(args);
    if (reclaimed !== undefined) {
      console.warn(
        `Stopped a watch session left running by an earlier run (PID ${reclaimed}).`,
      );
    }

    const process = new Deno.Command(executable, { args }).spawn();
    await this.session?.begin(process.pid);
    const tree = new ProcessTree(process.pid);

    // Once it has exited its PID is free for reuse, so it must not be signalled again.
    let exited = false;
    const teardown = () => {
      if (!exited) tree.terminate();
    };

    // A compose project admits one `watch` at a time, so a child left behind
    // (by a signal that isn't SIGINT, or by anything below throwing) blocks
    // the next session with "cannot take exclusive lock".
    const signals: Deno.Signal[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    for (const signo of signals) Deno.addSignalListener(signo, teardown);
    signal?.addEventListener("abort", teardown, { once: true });
    if (signal?.aborted) teardown();

    try {
      await this.initRunner.run(artifacts.initCommands ?? [], {
        artifactPath,
        deploymentName: name,
      });
      // Up for as long as the session lasts, which is when it's used.
      if (ledger) await this.deployed?.record(ledger, artifactPath);

      await process.status;
      exited = true;
    } finally {
      teardown();
      exited = true;
      await this.session?.end();
      for (const signo of signals) Deno.removeSignalListener(signo, teardown);
      signal?.removeEventListener("abort", teardown);
    }
  }
}
