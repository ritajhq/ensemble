import { Delegate, type Emitter } from "@duesabati/evento";
import type * as Platform from "@ensemble/platform";
import type { Checkouts } from "./checkouts.ts";

/**
 * Keeps each project's checkout, and what it offers, at its ref's tip.
 *
 * At most one sync runs per project at a time. Requests arriving while one
 * runs don't queue up: one more sync follows it, of whatever the project is
 * by then. Different projects sync side by side.
 */
export class Synchronization {
  private readonly running = new Set<string>();
  private readonly pending = new Map<string, Platform.Project>();
  private readonly started = new Delegate<[Platform.Project]>();
  private readonly synced = new Delegate<
    [Platform.Project, Platform.Catalog]
  >();
  private readonly failed = new Delegate<[Platform.Project, unknown]>();

  constructor(
    private readonly checkouts: Checkouts,
    private readonly discovery: Platform.Discovery,
  ) {}

  get OnStarted(): Emitter<[Platform.Project]> {
    return this.started;
  }

  get OnSynced(): Emitter<[Platform.Project, Platform.Catalog]> {
    return this.synced;
  }

  get OnFailed(): Emitter<[Platform.Project, unknown]> {
    return this.failed;
  }

  /** Bring the project up to date with its ref. */
  request(project: Platform.Project): void {
    this.pending.set(project.id, project);
    if (this.running.has(project.id)) return;
    void this.drain(project.id);
  }

  private async drain(id: string): Promise<void> {
    this.running.add(id);
    try {
      for (let project = this.take(id); project; project = this.take(id)) {
        await this.sync(project);
      }
    } finally {
      this.running.delete(id);
    }
  }

  private take(id: string): Platform.Project | undefined {
    const project = this.pending.get(id);
    this.pending.delete(id);
    return project;
  }

  private async sync(project: Platform.Project): Promise<void> {
    this.started.Invoke(project);
    try {
      const checkout = await this.checkouts.update(project);
      this.synced.Invoke(
        project,
        await this.discovery.discover(checkout.path, checkout.commit),
      );
    } catch (error) {
      this.failed.Invoke(project, error);
    }
  }
}
