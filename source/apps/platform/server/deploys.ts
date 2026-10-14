import { Delegate, type Emitter } from "@duesabati/evento";
import { DeploymentEnvironment } from "@ensemble/core";
import type * as Platform from "@ensemble/platform";
import type { Checkouts } from "./checkouts.ts";
import type { Ensemble } from "./ensemble.ts";
import type * as Kv from "./kv.ts";

/** What a secret's value is printed as, wherever it shows up in a run's output. */
const MASK = "••••";

/** A secret shorter than this is never looked for in output: it would mask ordinary words. */
const MASKABLE_LENGTH = 4;

/** Thrown when a run names a project or environment that no longer exists. */
export class GoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoneError";
  }
}

/**
 * Carries out queued deploy runs: once the project's checkout is free, runs
 * `ens deploy` in it with the environment's values in its process
 * environment. Every step is announced — started, each line it printed (any
 * secret's value masked), and how it finished — for whoever keeps or shows
 * them.
 */
export class Deploys {
  private readonly started = new Delegate<[Platform.Run]>();
  private readonly printed = new Delegate<[Platform.Run, number, string]>();
  private readonly finished = new Delegate<[Platform.Run]>();

  constructor(
    private readonly projects: Kv.Projects,
    private readonly environments: Kv.Environments,
    private readonly values: Kv.Values,
    private readonly checkouts: Checkouts,
    private readonly ensemble: Ensemble,
  ) {}

  get OnStarted(): Emitter<[Platform.Run]> {
    return this.started;
  }

  /** A line the run printed, with its position in the run's output. */
  get OnPrinted(): Emitter<[Platform.Run, number, string]> {
    return this.printed;
  }

  get OnFinished(): Emitter<[Platform.Run]> {
    return this.finished;
  }

  /** Carry out `run`, once its project's checkout is free. */
  request(run: Platform.Run): void {
    void this.carryOut(run);
  }

  private async carryOut(queued: Platform.Run): Promise<void> {
    let run = queued;
    try {
      const { deployment } = run;
      const project = await this.projects.get(deployment.project);
      const environment = await this.environments.get(
        deployment.project,
        deployment.manifest,
        deployment.environment,
      );
      if (!project || !environment) {
        throw new GoneError(
          `${deployment.project}/${deployment.manifest}/${deployment.environment} no longer exists.`,
        );
      }

      await this.checkouts.use(project, async (checkout) => {
        run = run.start(checkout.commit);
        this.started.Invoke(run);
        const { variables, secrets } = await this.processValues(environment);
        let index = 0;
        await this.ensemble.deploy(
          deployment,
          checkout.path,
          variables,
          (line) => this.printed.Invoke(run, index++, mask(line, secrets)),
        );
      });
      this.finished.Invoke(run.succeed());
    } catch (error) {
      this.finished.Invoke(
        run.fail(error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /** The environment's values as `ens` reads them, and the secrets among them to mask. */
  private async processValues(environment: Platform.Environment): Promise<{
    variables: Record<string, string>;
    secrets: string[];
  }> {
    const supplied = await this.values.of(environment);
    const variables: Record<string, string> = {};
    for (const [name, value] of supplied.variables) {
      variables[DeploymentEnvironment.variableOf(name)] = value;
    }
    const secrets: string[] = [];
    for (const name of supplied.secrets) {
      const value = await this.values.reveal(environment, name);
      if (value === undefined) continue;
      variables[DeploymentEnvironment.variableOf(name)] = value;
      secrets.push(value);
    }
    return { variables, secrets };
  }
}

function mask(line: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length >= MASKABLE_LENGTH)
    .reduce((masked, secret) => masked.replaceAll(secret, MASK), line);
}
