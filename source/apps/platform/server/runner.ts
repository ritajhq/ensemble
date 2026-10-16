import { Delegate, type Emitter } from "@duesabati/evento";
import { DeploymentEnvironment, IngressFile, Instance } from "@ensemble/core";
import * as Platform from "@ensemble/platform";
import type { Checkout, Checkouts } from "./checkouts.ts";
import type { Ensemble } from "./ensemble.ts";
import type * as Github from "./github/index.ts";
import type * as Kv from "./kv.ts";
import { UpdateWindow } from "./update-window.ts";

/** What a secret's value is printed as, wherever it shows up in a run's output. */
const MASK = "••••";

/** A secret shorter than this is never looked for in output: it would mask ordinary words. */
const MASKABLE_LENGTH = 4;

/** Thrown when a run names a project, environment or preview setup that no longer exists. */
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

const NOTHING: Prepared = { values: {}, secrets: [] };

/** How one kind of work is carried out: what it runs with, which checkout it runs in, what it runs, and what follows however it went. */
interface Handling<W extends Platform.Work> {
  prepare(work: W): Promise<Prepared>;
  /** Runs `perform` in the checkout `work` needs: the project's as it is, brought to its ref's tip, or a branch's own. */
  checkout(
    work: W,
    project: Platform.Project,
    perform: (checkout: Checkout) => Promise<void>,
  ): Promise<void>;
  /** Runs `perform` in the checkout a run of `work`, cut across by a restart, was left working in — as it is, since the run still works in it. */
  rejoin(
    work: W,
    project: Platform.Project,
    perform: (checkout: Checkout) => Promise<void>,
  ): Promise<void>;
  perform(work: W, performance: Performance): Promise<void>;
  /** After the checkout's turn, whether or not `perform` ran in it. */
  settle(work: W): void;
}

/** What a piece of work is carried out with: run `run`'s `ens`, in its checkout, with its values, each line it prints handed to `onLine`. */
interface Performance {
  readonly run: string;
  readonly ensemble: Ensemble;
  readonly checkout: string;
  readonly values: Readonly<Record<string, string>>;
  readonly onLine: (line: string) => void;
}

/** How a run is taken up: started afresh, or rejoined where a restart left it running. */
interface Course {
  readonly ensemble: Ensemble;
  checkout<W extends Platform.Work>(
    handling: Handling<W>,
    work: W,
    project: Platform.Project,
    perform: (checkout: Checkout) => Promise<void>,
  ): Promise<void>;
  /** The run as it is once under way in a checkout at `commit`. */
  begin(run: Platform.Run, commit: string): Platform.Run;
}

/** A deployment's ingress records, published under whatever hosts it answers on outside. */
type Answering = Platform.Ingresses["ingresses"];

/**
 * Carries out queued runs — deploys, releases and preview changes alike:
 * once the checkout the work needs is free, runs `ens` in it with what the
 * work needs in its process environment — an environment's values for a
 * deploy, the project's credentials for a release, a base environment's
 * values with the preview's own overrides for a preview. Every step is
 * announced — started, each line it printed (any secret's value masked), how
 * it finished, and where a deployment now answers or no longer does — for
 * whoever keeps, shows or routes them.
 */
export class Runner {
  private readonly started = new Delegate<[Platform.Run]>();
  private readonly printed = new Delegate<[Platform.Run, number, string]>();
  private readonly finished = new Delegate<[Platform.Run]>();
  private readonly answering = new Delegate<[string, Answering]>();
  private readonly withdrawn = new Delegate<[string]>();
  private readonly previewUp = new Delegate<[Kv.LivePreview]>();
  private readonly previewDown = new Delegate<[Platform.PreviewChange]>();

  /** What follows each termination of a deploy that succeeded: an apply changed what runs, so where it answers is read again; a plan changed nothing. */
  private readonly afterDeploy: Readonly<
    Record<
      Platform.Termination,
      (deployment: Platform.Deployment, checkout: string) => Promise<void>
    >
  > = {
    apply: async (deployment, checkout) =>
      this.answering.Invoke(
        deployment.owner,
        await this.ingressesOf(
          checkout,
          deployment.manifest,
          deployment.instance,
          deployment.kit,
        ),
      ),
    plan: () => Promise.resolve(),
  };

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
    private readonly previewSettings: Kv.PreviewSettings,
    checkouts: Checkouts,
    private readonly ensemble: Ensemble,
    /** Who each project's releases commit, tag and push as. */
    private readonly releasers: Github.Releasers,
    /** The public domain previews answer under. */
    private readonly previewDomain: string,
    /** The compose stack the platform itself runs as (`<project>-<manifest>`): applying it is an update of the platform, carried out alone. */
    private readonly stack?: string,
  ) {
    const previewIntents: Readonly<
      Record<
        Platform.PreviewIntent,
        Handling<Platform.PreviewChange>
      >
    > = {
      deploy: {
        prepare: (change) => this.previewValues(change),
        checkout: (change, project, perform) =>
          checkouts.branch(project, change.branch, perform),
        rejoin: (change, project, perform) =>
          checkouts.branchAsIs(project, change.branch, perform),
        perform: async (
          change,
          { run, ensemble, checkout, values, onLine },
        ) => {
          const preview = this.previewOf(change);
          await ensemble.preview(
            change,
            preview.instance,
            checkout,
            values,
            onLine,
            run,
          );
          await this.publishPreview(change, preview, checkout);
        },
        settle: () => {},
      },
      destroy: {
        prepare: () => Promise.resolve(NOTHING),
        checkout: (change, project, perform) =>
          checkouts.lastOfBranch(project, change.branch, perform),
        rejoin: (change, project, perform) =>
          checkouts.lastOfBranch(project, change.branch, perform),
        perform: (change, { run, ensemble, checkout, values, onLine }) =>
          ensemble.preview(
            change,
            this.previewOf(change).instance,
            checkout,
            values,
            onLine,
            run,
          ),
        settle: (change) => {
          this.withdrawn.Invoke(this.previewOf(change).owner);
          this.previewDown.Invoke(change);
        },
      },
    };

    this.handlings = {
      deploy: {
        prepare: (deployment) => this.environmentValues(deployment),
        checkout: (_, project, perform) => checkouts.use(project, perform),
        rejoin: (_, project, perform) => checkouts.use(project, perform),
        perform: async (
          deployment,
          { run, ensemble, checkout, values, onLine },
        ) => {
          await ensemble.deploy(deployment, checkout, values, onLine, run);
          await this.afterDeploy[deployment.termination](deployment, checkout);
        },
        settle: () => {},
      },
      release: {
        prepare: (release) => this.releaseCredentials(release),
        checkout: (_, project, perform) => checkouts.refresh(project, perform),
        rejoin: (_, project, perform) => checkouts.use(project, perform),
        perform: (release, { run, ensemble, checkout, values, onLine }) =>
          ensemble.release(release, checkout, values, onLine, run),
        settle: () => {},
      },
      preview: {
        prepare: (change) => previewIntents[change.intent].prepare(change),
        checkout: (change, project, perform) =>
          previewIntents[change.intent].checkout(change, project, perform),
        rejoin: (change, project, perform) =>
          previewIntents[change.intent].rejoin(change, project, perform),
        perform: (change, performance) =>
          previewIntents[change.intent].perform(change, performance),
        settle: (change) => previewIntents[change.intent].settle(change),
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

  /** A deployment (`<project>/<manifest>/<environment or instance>`) is up, answering where these ingresses say. */
  get OnAnswering(): Emitter<[string, Answering]> {
    return this.answering;
  }

  /** A deployment was taken down: nothing answers for it any more. */
  get OnWithdrawn(): Emitter<[string]> {
    return this.withdrawn;
  }

  /** A branch's preview is up, at these public hosts. */
  get OnPreviewUp(): Emitter<[Kv.LivePreview]> {
    return this.previewUp;
  }

  /** A branch's preview was taken down. */
  get OnPreviewDown(): Emitter<[Platform.PreviewChange]> {
    return this.previewDown;
  }

  /** Carry out `run`, once the checkout it needs is free — and, around an update of the platform itself, once the update allows. */
  request(run: Platform.Run): void {
    this.admit(run, this.fresh());
  }

  /**
   * Take up the runs a restart left unfinished: first those it cut across,
   * rejoined where they still run — so an update of the platform among them
   * holds back the rest until it's over — then those still queued, carried
   * out as asked.
   */
  recover(runs: readonly Platform.Run[]): void {
    for (const state of RECOVERY_ORDER) {
      for (const run of runs.filter((run) => run.state === state)) {
        this.recoveries[state](run);
      }
    }
  }

  private readonly recoveries: Readonly<
    Record<Platform.RunState, (run: Platform.Run) => void>
  > = {
    queued: (run) => this.request(run),
    running: (run) => this.admit(run, this.rejoined()),
    succeeded: () => {},
    failed: () => {},
  };

  private readonly window = new UpdateWindow();

  /** Carries `run` out through the update window: alone, if it updates the platform; otherwise whenever no update is pending. */
  private admit(run: Platform.Run, course: Course): void {
    void this.window[this.entranceOf(run.work)](() =>
      this.carryOut(run, course)
    );
  }

  private entranceOf(work: Platform.Work): "update" | "ordinary" {
    return this.updatesPlatform(work) ? "update" : "ordinary";
  }

  /** Whether `work` applies the stack the platform itself runs as: its plain deployment, not a preview's instance of it, nor a plan. */
  private updatesPlatform(work: Platform.Work): boolean {
    if (work.kind !== "deploy") return false;
    if (work.termination !== "apply" || work.instance) return false;
    return this.stack === `${work.project}-${work.manifest}`;
  }

  /** A run started now: its checkout readied for it, and its start announced. */
  private fresh(): Course {
    return {
      ensemble: this.ensemble,
      checkout: (handling, work, project, perform) =>
        handling.checkout(work, project, perform),
      begin: (run, commit) => {
        const started = run.start(commit);
        this.started.Invoke(started);
        return started;
      },
    };
  }

  /** A run a restart cut across: followed where it still runs, in its checkout as it left it, already started. */
  private rejoined(): Course {
    return {
      ensemble: this.ensemble.rejoining(),
      checkout: (handling, work, project, perform) =>
        handling.rejoin(work, project, perform),
      begin: (run) => run,
    };
  }

  private async carryOut(
    queued: Platform.Run,
    course: Course,
  ): Promise<void> {
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

      await course.checkout(handling, run.work, project, async (checkout) => {
        run = course.begin(run, checkout.commit);
        let index = 0;
        await handling.perform(run.work, {
          run: run.id,
          ensemble: course.ensemble,
          checkout: checkout.path,
          values,
          onLine: (line) =>
            this.printed.Invoke(run, index++, mask(line, secrets)),
        });
      });
      handling.settle(run.work);
      this.finished.Invoke(run.succeed());
    } catch (error) {
      this.finished.Invoke(
        run.fail(error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /** Where a deployment recorded it answers, as `ens deploy` left it in `checkout`. */
  private async ingressesOf(
    checkout: string,
    manifest: string,
    instance: string | undefined,
    kit: string,
  ): Promise<Answering> {
    const scope = instance
      ? Instance.parse(instance).scope(manifest)
      : manifest;
    return (await IngressFile.for(checkout, scope, kit).read())?.ingresses ??
      [];
  }

  /** Publishes a preview that came up: each host it answers under its internal domain, at its public host; anything else it answers for isn't published. */
  private async publishPreview(
    change: Platform.PreviewChange,
    preview: Platform.Preview,
    checkout: string,
  ): Promise<void> {
    const recorded = await this.ingressesOf(
      checkout,
      change.manifest,
      preview.instance,
      change.kit,
    );
    const published = recorded.map((ingress) => {
      const rewrites: Record<string, string> = {};
      for (const host of ingress.hosts) {
        const publicHost = preview.publicHostOf(host);
        if (publicHost) rewrites[publicHost] = host;
      }
      return {
        ...ingress,
        hosts: Object.keys(rewrites),
        rewrites,
        guarded: true,
      };
    });
    this.answering.Invoke(preview.owner, published);
    this.previewUp.Invoke({
      project: change.project,
      manifest: change.manifest,
      branch: change.branch,
      kit: change.kit,
      hosts: published.flatMap((ingress) => ingress.hosts),
    });
  }

  private previewOf(change: Platform.PreviewChange): Platform.Preview {
    return Platform.Preview.of({
      project: change.project,
      manifest: change.manifest,
      branch: change.branch,
      domain: this.previewDomain,
    });
  }

  /** The deployed environment's values as `ens` reads them. */
  private async environmentValues(
    deployment: Platform.Deployment,
  ): Promise<Prepared> {
    return await this.valuesOf(
      deployment.project,
      deployment.manifest,
      deployment.environment,
    );
  }

  /** The preview's base environment's values, with the manifest's overrides filled for this preview on top. */
  private async previewValues(
    change: Platform.PreviewChange,
  ): Promise<Prepared> {
    const settings = await this.previewSettings.get(
      change.project,
      change.manifest,
    );
    if (!settings) {
      throw new GoneError(
        `${change.project}/${change.manifest} is no longer previewed.`,
      );
    }
    const base = await this.valuesOf(
      change.project,
      change.manifest,
      settings.base,
    );
    const preview = this.previewOf(change);
    const values = { ...base.values };
    for (const [name, template] of Object.entries(settings.overrides)) {
      values[DeploymentEnvironment.variableOf(name)] = preview.render(template);
    }
    return { values, secrets: base.secrets };
  }

  private async valuesOf(
    project: string,
    manifest: string,
    name: string,
  ): Promise<Prepared> {
    const environment = await this.environments.get(project, manifest, name);
    if (!environment) {
      throw new GoneError(`${project}/${manifest}/${name} no longer exists.`);
    }

    const supplied = await this.values.of(environment);
    const values: Record<string, string> = {};
    for (const [variable, value] of supplied.variables) {
      values[DeploymentEnvironment.variableOf(variable)] = value;
    }
    const secrets: string[] = [];
    for (const secret of supplied.secrets) {
      const value = await this.values.reveal(environment, secret);
      if (value === undefined) continue;
      values[DeploymentEnvironment.variableOf(secret)] = value;
      secrets.push(value);
    }
    return { values, secrets };
  }

  /** The project's release credentials, under their own names, and its releaser's identity and token. */
  private async releaseCredentials(
    release: Platform.Release,
  ): Promise<Prepared> {
    const project = await this.projects.get(release.project);
    if (!project) {
      throw new GoneError(`Project "${release.project}" no longer exists.`);
    }
    const credentials = await this.credentials.reveal(release.project);
    const releaser = await this.releasers.of(project.repository);
    return {
      values: { ...credentials, ...releaser.environment() },
      secrets: [...Object.values(credentials), releaser.token],
    };
  }
}

/** Which unfinished runs a restart left are taken up first. */
const RECOVERY_ORDER: readonly Platform.RunState[] = ["running", "queued"];

function mask(line: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length >= MASKABLE_LENGTH)
    .reduce((masked, secret) => masked.replaceAll(secret, MASK), line);
}
