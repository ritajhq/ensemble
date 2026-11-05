import { runBuild, runPack } from "../pipeline.ts";
import type { Ports } from "../ports.ts";
import type { Outputs } from "./session.ts";

/**
 * Produces and keeps current what launch entries run, through the same build and pack steps `ens build` and `ens pack`
 * run: once each first, then each kit's own `--watch`. A pack asks for its builds itself, and the builds this class
 * already keeps current are left out of that, so two watchers never build the same app.
 */
export class CommandOutputs implements Outputs {
  private readonly done = new Set<string>();

  constructor(private readonly ports: Ports) {}

  async prepare(builds: readonly string[], packs: readonly string[]): Promise<void> {
    for (const app of builds) {
      await this.expect(`build ${app}`, runBuild(app, { mode: "development", watch: false, done: this.done }, this.ports));
    }
    for (const ship of packs) {
      await this.expect(`pack ${ship}`, runPack(ship, undefined, { watch: false, done: this.done }, this.ports));
    }
  }

  async keepCurrent(builds: readonly string[], packs: readonly string[], signal: AbortSignal): Promise<void> {
    if (builds.length + packs.length > 0) console.log(`Keeping current: ${[...builds, ...packs].join(", ")}`);
    await Promise.allSettled([
      ...builds.map((app) => runBuild(app, { mode: "development", watch: true, signal }, this.ports)),
      ...packs.map((ship) =>
        runPack(ship, undefined, { watch: true, signal, skipBuildingApps: new Set(builds) }, this.ports)
      ),
    ]);
  }

  private async expect(what: string, step: Promise<number>): Promise<void> {
    const code = await step;
    if (code === 0) return;
    throw new Error(`Could not ${what} (exit code ${code}), which the launch needs.`);
  }
}
