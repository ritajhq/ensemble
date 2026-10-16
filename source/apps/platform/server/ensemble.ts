import type * as Platform from "@ensemble/platform";
import { ChildProcess, type Command, type Execution } from "./execution.ts";

export { CommandFailedError } from "./execution.ts";

/**
 * What `ens` and the kits it runs may see of the platform's own environment:
 * where programs and the Docker daemon are, and nothing else. The platform's
 * secret key and GitHub token stay its own.
 */
const PASSTHROUGH = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "TMPDIR",
  "XDG_RUNTIME_DIR",
  "DENO_DIR",
  "DOCKER_HOST",
  "DOCKER_CONFIG",
] as const;

/** What each termination adds to `ens deploy`. */
const TERMINATION_FLAGS: Readonly<
  Record<Platform.Termination, readonly string[]>
> = {
  plan: ["--plan"],
  apply: [],
};

/** What `ens` is run with for each preview intent: a preview is built from its branch (`--artifacts local`), and taken down by its instance alone. */
const PREVIEW_COMMANDS: Readonly<
  Record<
    Platform.PreviewIntent,
    (change: Platform.PreviewChange, instance: string) => readonly string[]
  >
> = {
  deploy: (change, instance) => [
    "deploy",
    change.manifest,
    change.kit,
    "--artifacts",
    "local",
    "--instance",
    instance,
  ],
  destroy: (change, instance) => [
    "destroy",
    change.manifest,
    change.kit,
    "--instance",
    instance,
  ],
};

/** How a run's command is carried out: started, or — for a run a restart cut across — rejoined where it still runs. */
type Launch = (
  id: string,
  command: Command,
  onLine: (line: string) => void,
) => Promise<void>;

/**
 * The `ens` CLI, run in a project's checkout as run `id`. An environment's
 * values, and a project's release credentials, reach it the way they reach
 * `ens` in any pipeline: through its process environment.
 */
export class Ensemble {
  private readonly launch: Launch;

  constructor(
    private readonly binary: string,
    private readonly host: Deno.Env = Deno.env,
    private readonly execution: Execution = new ChildProcess(),
    launch?: Launch,
  ) {
    this.launch = launch ??
      ((id, command, onLine) => execution.run(id, command, onLine));
  }

  /** The same `ens`, whose every command rejoins the run it was started as before a restart, rather than starting again. */
  rejoining(): Ensemble {
    return new Ensemble(
      this.binary,
      this.host,
      this.execution,
      (id, _, onLine) => this.execution.rejoin(id, onLine),
    );
  }

  /** Runs `ens deploy` for `deployment`, handing each line it prints to `onLine`. */
  async deploy(
    deployment: Platform.Deployment,
    checkout: string,
    values: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
    id: string = crypto.randomUUID(),
  ): Promise<void> {
    await this.run(
      id,
      [
        "deploy",
        deployment.manifest,
        deployment.kit,
        "--artifacts",
        "published",
        "--version",
        deployment.version,
        ...(deployment.instance ? ["--instance", deployment.instance] : []),
        ...TERMINATION_FLAGS[deployment.termination],
      ],
      checkout,
      values,
      onLine,
    );
  }

  /**
   * Runs `ens release` for `release`, answering yes to each of its
   * questions, with `credentials`: what it publishes with, and who it
   * commits, tags and pushes as.
   */
  async release(
    release: Platform.Release,
    checkout: string,
    credentials: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
    id: string = crypto.randomUUID(),
  ): Promise<void> {
    await this.run(
      id,
      ["release", release.action, release.argument, "--yes"],
      checkout,
      credentials,
      onLine,
    );
  }

  /** Brings `change`'s preview up from its branch's checkout, or takes it down. */
  async preview(
    change: Platform.PreviewChange,
    instance: string,
    checkout: string,
    values: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
    id: string = crypto.randomUUID(),
  ): Promise<void> {
    await this.run(
      id,
      PREVIEW_COMMANDS[change.intent](change, instance),
      checkout,
      values,
      onLine,
    );
  }

  private async run(
    id: string,
    args: readonly string[],
    cwd: string,
    values: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
  ): Promise<void> {
    await this.launch(id, {
      program: this.binary,
      args,
      cwd,
      env: { ...this.passedThrough(), ...values, NO_COLOR: "1" },
    }, onLine);
  }

  private passedThrough(): Record<string, string> {
    return Object.fromEntries(
      PASSTHROUGH.flatMap((name) => {
        const value = this.host.get(name);
        return value === undefined ? [] : [[name, value]];
      }),
    );
  }
}
