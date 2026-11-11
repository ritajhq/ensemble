import type { Repository } from "./repository.ts";

/**
 * Keeps the docs on disk at the repository's latest commit: it publishes once
 * at startup, which is what fills an empty volume, then again whenever the
 * remote moves past the commit last published. A failed attempt records
 * nothing, so the next round retries it. Rounds never overlap: each waits for
 * the previous one to finish.
 */
export class Poller {
  #published: string | undefined;

  constructor(
    private readonly repository: Repository,
    private readonly intervalMs: number,
  ) {}

  Start(): void {
    void this.#run();
  }

  async #run(): Promise<void> {
    while (true) {
      await this.#round();
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    }
  }

  async #round(): Promise<void> {
    try {
      const head = await this.repository.Head();
      if (head === this.#published) return;
      this.#published = await this.repository.Publish();
      console.log(`docs published at ${this.#published}`);
    } catch (error) {
      console.error("docs sync failed:", error);
    }
  }
}
