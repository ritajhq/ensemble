/**
 * Ensures at most one sync runs per repo id at a time. A trigger that arrives
 * while that repo's sync is already running is coalesced into a single
 * pending follow-up, rather than overlapping two `git clone`s into the same
 * destination or queuing unboundedly behind a slow remote.
 */
export class SyncQueue {
  readonly #running = new Set<string>();
  readonly #pending = new Set<string>();

  constructor(private readonly runOne: (id: string) => Promise<void>) {}

  trigger(id: string): void {
    if (this.#running.has(id)) {
      this.#pending.add(id);
      return;
    }
    this.#start(id);
  }

  #start(id: string): void {
    this.#running.add(id);
    this.runOne(id)
      .catch((error: unknown) =>
        console.error(`sync failed for "${id}":`, error)
      )
      .finally(() => {
        this.#running.delete(id);
        if (this.#pending.delete(id)) this.#start(id);
      });
  }
}
