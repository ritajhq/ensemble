import type { Deployment } from "./deployment.ts";
import type { Release } from "./release.ts";

/** What a run carries out: a deployment of one environment, or a release of a whole project. */
export type Work = Deployment | Release;

export type RunState = "queued" | "running" | "succeeded" | "failed";

/**
 * One time some work was carried out on a project: queued when asked for,
 * running once the project's checkout is free, then succeeded or failed.
 * Each step is a new `Run`; what it printed is kept beside it, line by line.
 */
export class Run {
  private constructor(
    readonly id: string,
    readonly work: Work,
    readonly state: RunState,
    readonly queuedAt: string,
    readonly startedAt?: string,
    readonly finishedAt?: string,
    /** The commit it was carried out at. */
    readonly commit?: string,
    readonly error?: string,
  ) {}

  static queue(work: Work, at: Date = new Date()): Run {
    return new Run(crypto.randomUUID(), work, "queued", at.toISOString());
  }

  static restore(fields: {
    id: string;
    work: Work;
    state: RunState;
    queuedAt: string;
    startedAt?: string;
    finishedAt?: string;
    commit?: string;
    error?: string;
  }): Run {
    return new Run(
      fields.id,
      fields.work,
      fields.state,
      fields.queuedAt,
      fields.startedAt,
      fields.finishedAt,
      fields.commit,
      fields.error,
    );
  }

  start(commit: string, at: Date = new Date()): Run {
    return this.with({ state: "running", startedAt: at.toISOString(), commit });
  }

  succeed(at: Date = new Date()): Run {
    return this.with({ state: "succeeded", finishedAt: at.toISOString() });
  }

  fail(error: string, at: Date = new Date()): Run {
    return this.with({
      state: "failed",
      finishedAt: at.toISOString(),
      error,
    });
  }

  private with(
    changes: Partial<
      Pick<Run, "state" | "startedAt" | "finishedAt" | "commit" | "error">
    >,
  ): Run {
    return Run.restore({ ...this, ...changes });
  }
}
