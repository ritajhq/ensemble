import type { LaunchEntry } from "../deploy/launch.ts";
import { LaunchPlan } from "../deploy/launch-plan.ts";
import { OutputWatcher } from "./output-watcher.ts";
import { PortAllocator } from "./ports.ts";
import { type Output, RestartRules } from "./restart-rules.ts";
import { Supervisor } from "./supervisor.ts";
import { type Locations, Values } from "./values.ts";

/** What a session needs built and packed before it can start, and kept current while it runs. */
export interface Outputs {
  /** Builds and packs each once, so what the entries run exists. */
  prepare(builds: readonly string[], packs: readonly string[]): Promise<void>;
  /** Keeps them current until `signal` aborts (the kits' own `--watch`). Resolves when they have all ended. */
  keepCurrent(builds: readonly string[], packs: readonly string[], signal: AbortSignal): Promise<void>;
}

/**
 * One `ens develop` launch: builds what the entries run, starts them in the order their references give, restarts the
 * ones that asked to when a build or pack they read changes, and stops everything when the developer is done (an app
 * closed, or the signal aborted).
 */
export class Session {
  private readonly plan: LaunchPlan;
  private readonly rules: RestartRules;

  constructor(
    private readonly entries: Readonly<Record<string, LaunchEntry>>,
    known: { builds: ReadonlySet<string>; packs: ReadonlySet<string> },
    private readonly locations: Locations,
    private readonly outputs: Outputs,
    private readonly supervisor: Supervisor,
    private readonly environment?: (name: string) => string | undefined,
  ) {
    this.plan = new LaunchPlan(entries, known);
    this.rules = new RestartRules(entries);
  }

  async run(signal: AbortSignal): Promise<void> {
    const builds = this.used("builds", "build");
    const packs = this.used("packs", "pack");
    await this.outputs.prepare(builds, packs);

    const companions = new AbortController();
    const keeping = this.outputs.keepCurrent(builds, packs, companions.signal);
    const values = new Values(this.locations, new PortAllocator().assign(this.entries), this.environment);
    const watchers: OutputWatcher[] = [];
    const onAbort = () => void this.supervisor.stop();
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      await this.supervisor.start(this.plan.order().map((name) => values.runnable(name, this.entries[name])));
      watchers.push(...this.rules.outputs().map((output) => this.watch(output)));
      if (signal.aborted) onAbort();
      await this.supervisor.whenEnded();
    } finally {
      signal.removeEventListener("abort", onAbort);
      for (const watcher of watchers) watcher.close();
      await this.supervisor.stop();
      companions.abort();
      await keeping;
    }
  }

  private watch(output: Output): OutputWatcher {
    const path = "build" in output ? this.locations.build(output.build) : this.locations.pack(output.pack);
    return new OutputWatcher(path, () => void this.restartFor(output));
  }

  private async restartFor(output: Output): Promise<void> {
    for (const name of this.rules.for(output)) await this.supervisor.restart(name);
  }

  /** Everything of one kind the entries use or restart for. */
  private used(kind: "builds" | "packs", key: "build" | "pack"): string[] {
    const names = new Set<string>();
    for (const name of this.plan.order()) this.plan.usedBy(name)[kind].forEach((used) => names.add(used));
    for (const output of this.rules.outputs()) if (key in output) names.add((output as Record<string, string>)[key]);
    return [...names];
  }
}
