import { join } from "@std/path";
import { CATEGORIES, type Workload } from "../deploy/workload.ts";
import { EnsembleConfigStore } from "../config.ts";
import { loadLaunchManifest } from "../deploy-context.ts";
import type { EnvFile } from "../env-files.ts";
import type { Ports } from "../ports.ts";
import { CommandOutputs } from "./command-outputs.ts";
import { Readiness } from "./readiness.ts";
import { Session } from "./session.ts";
import { Backoff, Supervisor } from "./supervisor.ts";

const SIGNALS: readonly Deno.Signal[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/**
 * A manifest's `launch:` section, ready to run for `ens develop`: begins once what it launches against is up (after
 * the deploy, or at once when the manifest deploys nothing), and ends with the developer's Ctrl+C.
 */
export class Launch {
  private readonly controller = new AbortController();
  private running?: Promise<void>;

  private constructor(
    private readonly session: Session,
    /** Whether the manifest also deploys something, to be up before this begins. */
    readonly alsoDeploys: boolean,
  ) {}

  /** The launch the manifest `name` describes, or undefined when it has no `launch:` section. */
  static async open(name: string, envFiles: readonly EnvFile[], ports: Ports): Promise<Launch | undefined> {
    const { repoRoot, workload } = await loadLaunchManifest(name, ports.repo, envFiles);
    if (!workload.launch) return undefined;

    const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();
    const artifacts = join(repoRoot, "source", "artifacts");
    const session = new Session(
      workload.launch,
      { builds: new Set(Object.keys(config.build ?? {})), packs: new Set(Object.keys(config.pack ?? {})) },
      { build: (app) => join(artifacts, app), pack: (ship) => join(artifacts, "packages", ship) },
      new CommandOutputs(ports),
      new Supervisor(repoRoot, new Readiness(), () => new Backoff()),
    );
    return new Launch(session, Launch.deploysAnything(workload));
  }

  /** Starts the launch in the background; later calls do nothing. */
  begin(): void {
    if (this.running) return;
    const stop = () => this.controller.abort();
    for (const signo of SIGNALS) Deno.addSignalListener(signo, stop);
    this.running = this.session.run(this.controller.signal).finally(() => {
      for (const signo of SIGNALS) Deno.removeSignalListener(signo, stop);
    });
  }

  /** Stops the launch and waits until everything it started has ended. Rethrows what stopped it early. */
  async end(): Promise<void> {
    this.controller.abort();
    await this.running;
  }

  /** Begins, and waits until the launch is over: an app closed, or Ctrl+C. */
  async run(): Promise<void> {
    this.begin();
    await this.running;
  }

  /** Whether the manifest provisions anything. Declared secrets and variables are values for the launch to read, not something to bring up. */
  private static deploysAnything(workload: Workload): boolean {
    return CATEGORIES
      .filter((category) => category !== "secrets" && category !== "variables")
      .some((category) => Object.keys(workload[category] ?? {}).length > 0);
  }
}
