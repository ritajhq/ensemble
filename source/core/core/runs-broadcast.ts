import type { RunRecord } from "./runs.ts";

const subscribers = new Map<string, Set<(record: RunRecord) => void>>();

/** Notifies every live subscriber of `runId` with `record`'s latest snapshot. No-op if nobody is subscribed. */
export function publishRunUpdate(runId: string, record: RunRecord): void {
  for (const callback of subscribers.get(runId) ?? []) {
    callback(record);
  }
}

/** Subscribes to every update published for `runId`. Returns a function that unsubscribes. */
export function subscribeToRun(runId: string, callback: (record: RunRecord) => void): () => void {
  let set = subscribers.get(runId);
  if (!set) {
    set = new Set();
    subscribers.set(runId, set);
  }
  set.add(callback);

  return () => {
    set.delete(callback);
    if (set.size === 0) subscribers.delete(runId);
  };
}
