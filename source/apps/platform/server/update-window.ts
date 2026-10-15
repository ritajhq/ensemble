/**
 * When runs may go ahead around an update of the platform itself. Like a
 * shop that closes for a refit: the refit waits for the last customer to
 * leave, and whoever arrives meanwhile waits at the door until it reopens.
 * An update waits for every run in progress to finish, then runs alone; a
 * run asked for once an update is pending waits until the update is over —
 * or, if the update replaces the platform, stays queued for the platform
 * that comes back to carry out.
 */
export class UpdateWindow {
  private running = 0;
  private idle?: PromiseWithResolvers<void>;
  /** Settles once every update asked for so far is over. */
  private updates: Promise<void> = Promise.resolve();

  /** Carries out `run` once no update is pending or under way. */
  async ordinary<T>(run: () => Promise<T>): Promise<T> {
    // Waits until no update was asked for while it waited: the last check
    // and taking a place happen together, with no update slipping between.
    let awaited: Promise<void>;
    do {
      awaited = this.updates;
      await awaited;
    } while (awaited !== this.updates);

    this.running++;
    try {
      return await run();
    } finally {
      this.running--;
      if (this.running === 0) this.idle?.resolve();
    }
  }

  /** Carries out `update` alone: after the updates asked for before it, once nothing else runs. */
  async update<T>(update: () => Promise<T>): Promise<T> {
    const before = this.updates;
    const over = Promise.withResolvers<void>();
    this.updates = before.then(() => over.promise);
    try {
      await before;
      await this.untilIdle();
      return await update();
    } finally {
      over.resolve();
    }
  }

  private async untilIdle(): Promise<void> {
    while (this.running > 0) {
      this.idle = Promise.withResolvers<void>();
      await this.idle.promise;
    }
  }
}
