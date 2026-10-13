import { Delegate, type Emitter } from "@duesabati/evento";
import type { Preview } from "./configuration.ts";

export type Intent = "deploy" | "destroy";

/** What bringing a preview up or taking it down needs from the outside world; `Previews` only decides when. */
export interface PreviewWork {
  deploy(preview: Preview): Promise<void>;
  destroy(preview: Preview): Promise<void>;
}

/**
 * Keeps each branch's preview in the state the last event asked for.
 *
 * At most one piece of work runs per preview at a time. What arrives while it
 * runs doesn't queue up: only the latest wish is kept and acted on after, so
 * five pushes in a row cost one extra deploy of the newest commit, and a
 * branch deleted mid-deploy is destroyed as soon as that deploy finishes
 * rather than deployed again. Different previews run side by side.
 */
export class Previews {
  private readonly running = new Set<string>();
  private readonly latest = new Map<string, Wish>();

  private readonly deployed = new Delegate<[Preview]>();
  private readonly destroyed = new Delegate<[Preview]>();
  private readonly failed = new Delegate<[Preview, Intent, unknown]>();

  constructor(private readonly work: PreviewWork) {}

  get OnDeployed(): Emitter<[Preview]> {
    return this.deployed;
  }

  get OnDestroyed(): Emitter<[Preview]> {
    return this.destroyed;
  }

  get OnFailed(): Emitter<[Preview, Intent, unknown]> {
    return this.failed;
  }

  /** The branch has a new tip: make the preview match it. */
  pushed(preview: Preview): void {
    this.want(preview, "deploy");
  }

  /** The branch is gone: take its preview down. */
  deleted(preview: Preview): void {
    this.want(preview, "destroy");
  }

  private want(preview: Preview, intent: Intent): void {
    const key = this.keyOf(preview);
    this.latest.set(key, { preview, intent });
    if (this.running.has(key)) return;
    void this.drain(key);
  }

  private async drain(key: string): Promise<void> {
    this.running.add(key);
    try {
      for (let wish = this.take(key); wish; wish = this.take(key)) {
        await this.carryOut(wish);
      }
    } finally {
      this.running.delete(key);
    }
  }

  private take(key: string): Wish | undefined {
    const wish = this.latest.get(key);
    this.latest.delete(key);
    return wish;
  }

  private async carryOut({ preview, intent }: Wish): Promise<void> {
    try {
      if (intent === "deploy") {
        await this.work.deploy(preview);
        this.deployed.Invoke(preview);
        return;
      }
      await this.work.destroy(preview);
      this.destroyed.Invoke(preview);
    } catch (error) {
      this.failed.Invoke(preview, intent, error);
    }
  }

  private keyOf(preview: Preview): string {
    return `${preview.repository.id}/${preview.slug}`;
  }
}

interface Wish {
  readonly preview: Preview;
  readonly intent: Intent;
}
