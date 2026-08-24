import type { RunRecord } from "./store.ts";

/** Fans out live run-record updates to SSE subscribers — owns the subscriber registry as instance state rather than module-level mutable state. */
export class RunUpdateBroadcaster {
  private readonly subscribers = new Map<string, Set<(record: RunRecord) => void>>();

  /** Notifies every live subscriber of `runId` with `record`'s latest snapshot. No-op if nobody is subscribed. */
  publish(runId: string, record: RunRecord): void {
    for (const callback of this.subscribers.get(runId) ?? []) {
      callback(record);
    }
  }

  /** Subscribes to every update published for `runId`. Returns a function that unsubscribes. */
  subscribe(runId: string, callback: (record: RunRecord) => void): () => void {
    let set = this.subscribers.get(runId);
    if (!set) {
      set = new Set();
      this.subscribers.set(runId, set);
    }
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) this.subscribers.delete(runId);
    };
  }
}
