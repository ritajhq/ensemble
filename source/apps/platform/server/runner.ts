import { Delegate, type Emitter } from "@duesabati/evento";
import { DeploymentEnvironment } from "@ensemble/core";
import type * as Platform from "@ensemble/platform";
import type { Checkout, Checkouts } from "./checkouts.ts";
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

/** The process environment a piece of work runs with, and the secrets in it to mask. */
interface Prepared {
  readonly values: Readonly<Record<string, string>>;
  readonly secrets: readonly string[];
}

/** How one kind of work is carried out: what it runs with, which checkout it runs in, and what it runs. */
interface Handling<W extends Platform.Work> {
  prepare(work: W): Promise<Prepared>;
  /** Runs `perform` in the project's checkout: as it is, or brought to its ref's tip first. */
  checkout(
    project: Platform.Project,
    perform: (checkout: Checkout) => Promise<void>,
  ): Promise<void>;
  perform(
    work: W,
    checkout: string,
    values: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
  ): Promise<void>;
}

/**
 * Carries out queued runs, deploys and releases alike: once the project's
 * checkout is free, runs `ens` in it with what the work needs in its process
 * environment — an environment's values for a deploy, the project's
 * credentials for a release. Every step is announced — started, each line it
 * printed (any secret's value masked), and how it finished — for whoever
 * keeps or shows them.
 */
export class Runner {
  private readonly started = new Delegate<[Platform.Run]>();
  private readonly printed = new Delegate<[Platform.Run, number, string]>();
  private readonly finished = new Delegate<[Platform.Run]>();
  private readonly handlings: {
    readonly [K in Platform.Work["kind"]]: Handling<
      Extract<Platform.Work, { kind: K }>
    >;
  };

  constructor(
    private readonly projects: Kv.Projects,
    private readonly environments: Kv.Environments,
    private readonly values: Kv.Values,
    private readonly credentials: Kv.Credentials,
    checkouts: Checkouts,
    ensemble: Ensemble,
  ) {
    this.handlings = {
      deploy: {
        prepare: (deployment) => this.environmentValues(deployment),
        checkout: (project, perform) => checkouts.use(project, perform),
        perform: (deployment, checkout, values, onLine) =>
          ensemble.deploy(deployment, checkout, values, onLine),
      },
      release: {
        prepare: (release) => this.releaseCredentials(release),
        checkout: (project, perform) => checkouts.refresh(project, perform),
        perform: (release, checkout, values, onLine) =>
          ensemble.release(release, checkout, values, onLine),
      },
    };
  }

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
      const project = await this.projects.get(run.work.project);
      if (!project) {
        throw new GoneError(`Project "${run.work.project}" no longer exists.`);
      }
      const handling = this.handlings[run.work.kind] as Handling<
        Platform.Work
      >;
      const { values, secrets } = await handling.prepare(run.work);

      await handling.checkout(project, async (checkout) => {
        run = run.start(checkout.commit);
        this.started.Invoke(run);
        let index = 0;
        await handling.perform(
          run.work,
          checkout.path,
          values,
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

  /** The deployed environment's values as `ens` reads them. */
  private async environmentValues(
    deployment: Platform.Deployment,
  ): Promise<Prepared> {
    const environment = await this.environments.get(
      deployment.project,
      deployment.manifest,
      deployment.environment,
    );
    if (!environment) {
      throw new GoneError(
        `${deployment.project}/${deployment.manifest}/${deployment.environment} no longer exists.`,
      );
    }

    const supplied = await this.values.of(environment);
    const values: Record<string, string> = {};
    for (const [name, value] of supplied.variables) {
      values[DeploymentEnvironment.variableOf(name)] = value;
    }
    const secrets: string[] = [];
    for (const name of supplied.secrets) {
      const value = await this.values.reveal(environment, name);
      if (value === undefined) continue;
      values[DeploymentEnvironment.variableOf(name)] = value;
      secrets.push(value);
    }
    return { values, secrets };
  }

  /** The project's release credentials, under their own names. */
  private async releaseCredentials(
    release: Platform.Release,
  ): Promise<Prepared> {
    const values = await this.credentials.reveal(release.project);
    return { values, secrets: Object.values(values) };
  }
}

function mask(line: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length >= MASKABLE_LENGTH)
    .reduce((masked, secret) => masked.replaceAll(secret, MASK), line);
}
