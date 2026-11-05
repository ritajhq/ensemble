import type { LaunchType } from "../deploy/launch.ts";
import { Readiness } from "./readiness.ts";
import { Running } from "./running.ts";
import type { Runnable } from "./values.ts";

/** What the supervisor does when an entry's program ends on its own. */
type OnExit = "restart" | "end-session";

/** A server that dies is started again; an app window the developer closes means they are done. */
const ON_EXIT: Record<LaunchType, OnExit> = {
  process: "restart",
  desktop: "end-session",
};

/** How long to wait before starting a crashed program again: doubling, up to a limit, back to the start once it has stayed up. */
export class Backoff {
  private attempt = 0;

  constructor(
    private readonly firstMs = 1000,
    private readonly limitMs = 16_000,
    private readonly healthyAfterMs = 10_000,
  ) {}

  /** The delay before the next start, given how long the program that just ended had been up. */
  next(upForMs: number): number {
    if (upForMs >= this.healthyAfterMs) this.attempt = 0;
    const delay = Math.min(this.firstMs * 2 ** this.attempt, this.limitMs);
    this.attempt += 1;
    return delay;
  }
}

interface Slot {
  readonly runnable: Runnable;
  running?: Running;
  /** Set while we are the ones stopping it, so its ending is not taken for a crash. */
  stopping: boolean;
  startedAt: number;
  readonly backoff: Backoff;
}

/**
 * Keeps a session's launch entries running: starts them in the order given, each once what it listens on accepts
 * connections; starts a crashed server again after a growing pause; restarts one on request (its build or pack
 * changed); and stops them all, last first. Ends the session when an app the developer was using is closed.
 */
export class Supervisor {
  private readonly slots = new Map<string, Slot>();
  private readonly order: string[] = [];
  private ending = false;
  private resolveEnded!: () => void;
  private readonly sessionEnded = new Promise<void>((resolve) => (this.resolveEnded = resolve));

  constructor(
    private readonly cwd: string,
    private readonly readiness = new Readiness(),
    private readonly backoffFor = () => new Backoff(),
  ) {}

  /** Resolves when the session is over: an app was closed, or `stop` was called. */
  whenEnded(): Promise<void> {
    return this.sessionEnded;
  }

  /** Starts each runnable in turn, waiting for one's ports before the next. Throws when one never becomes ready. */
  async start(runnables: readonly Runnable[]): Promise<void> {
    for (const runnable of runnables) {
      this.slots.set(runnable.name, {
        runnable,
        stopping: false,
        startedAt: 0,
        backoff: this.backoffFor(),
      });
      this.order.push(runnable.name);
      this.begin(runnable.name);
      await this.waitUntilReady(runnable);
    }
  }

  /** Stops the entry and starts it again, keeping its ports. */
  async restart(name: string): Promise<void> {
    const slot = this.slots.get(name);
    if (!slot || this.ending) return;
    console.log(`launch: restarting ${name}`);
    await this.halt(slot);
    this.begin(name);
    await this.waitUntilReady(slot.runnable);
  }

  async stop(): Promise<void> {
    this.ending = true;
    for (const name of [...this.order].reverse()) {
      await this.halt(this.slots.get(name)!);
    }
    this.resolveEnded();
  }

  /** Whether `name` is currently running. */
  isRunning(name: string): boolean {
    return this.slots.get(name)?.running !== undefined;
  }

  pidOf(name: string): number | undefined {
    return this.slots.get(name)?.running?.pid;
  }

  private begin(name: string): void {
    const slot = this.slots.get(name)!;
    slot.stopping = false;
    slot.startedAt = Date.now();
    const running = Running.start(slot.runnable, this.cwd);
    slot.running = running;
    running.exited.then((code) => this.ended(slot, running, code));
  }

  private async halt(slot: Slot): Promise<void> {
    const running = slot.running;
    if (!running) return;
    slot.stopping = true;
    await running.stop();
    slot.running = undefined;
  }

  private async waitUntilReady(runnable: Runnable): Promise<void> {
    const ports = Object.values(runnable.ports);
    const slot = this.slots.get(runnable.name)!;
    for (const port of ports) {
      const ready = await this.readiness.ofPort(port, () => slot.running !== undefined && !this.ending);
      if (!ready && !this.ending) {
        throw new Error(`launch.${runnable.name} did not start listening on port ${port}.`);
      }
    }
  }

  private ended(slot: Slot, running: Running, code: number): void {
    if (slot.running !== running || slot.stopping || this.ending) return;
    slot.running = undefined;
    ON_EXIT[slot.runnable.type] === "end-session"
      ? this.endSession(slot.runnable.name)
      : this.startAgain(slot, code);
  }

  private endSession(name: string): void {
    console.log(`launch: ${name} closed, ending the session`);
    void this.stop();
  }

  private startAgain(slot: Slot, code: number): void {
    const delay = slot.backoff.next(Date.now() - slot.startedAt);
    console.warn(`launch: ${slot.runnable.name} exited (${code}); starting it again in ${delay / 1000}s`);
    setTimeout(() => {
      if (this.ending || slot.running) return;
      this.begin(slot.runnable.name);
    }, delay);
  }
}
