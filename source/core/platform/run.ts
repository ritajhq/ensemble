import type { Deployment } from "./deployment.ts";

export type RunState = "queued" | "running" | "succeeded" | "failed";

/**
 * One time a deployment was carried out: queued when asked for, running once
 * its project's checkout is free, then succeeded or failed. Each step is a
 * new `Run`; what it printed is kept beside it, line by line.
 */
export class Run {
  private constructor(
    readonly id: string,
    readonly deployment: Deployment,
    readonly state: RunState,
    readonly queuedAt: string,
    readonly startedAt?: string,
    readonly finishedAt?: string,
    /** The commit its manifest was read at. */
    readonly commit?: string,
    readonly error?: string,
  ) {}

  static queue(deployment: Deployment, at: Date = new Date()): Run {
    return new Run(crypto.randomUUID(), deployment, "queued", at.toISOString());
  }

  static restore(fields: {
    id: string;
    deployment: Deployment;
    state: RunState;
    queuedAt: string;
    startedAt?: string;
    finishedAt?: string;
    commit?: string;
    error?: string;
  }): Run {
    return new Run(
      fields.id,
      fields.deployment,
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
