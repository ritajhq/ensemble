import { Delegate, type Emitter } from "@duesabati/evento";
import * as Platform from "@ensemble/platform";
import type { Checkouts } from "./checkouts.ts";
import type { Endpoints, Params } from "./endpoints.ts";
import type * as Kv from "./kv.ts";
import type { Router } from "./router.ts";
import { type RunFeed, RunView } from "./run-feed.ts";

/** How each kind of value an environment supplies is checked against its manifest, set and cleared. */
interface ValueKind {
  readonly declares: (manifest: Platform.Manifest, name: string) => boolean;
  readonly set: (
    values: Kv.Values,
    environment: Platform.Environment,
    name: string,
    value: string,
  ) => Promise<void>;
  readonly unset: (
    values: Kv.Values,
    environment: Platform.Environment,
    name: string,
  ) => Promise<void>;
}

const VALUE_KINDS: Readonly<Record<string, ValueKind>> = {
  variables: {
    declares: (manifest, name) => manifest.declaresVariable(name),
    set: (values, environment, name, value) =>
      values.setVariable(environment, name, value),
    unset: (values, environment, name) =>
      values.unsetVariable(environment, name),
  },
  secrets: {
    declares: (manifest, name) => manifest.declaresSecret(name),
    set: (values, environment, name, value) =>
      values.setSecret(environment, name, value),
    unset: (values, environment, name) => values.unsetSecret(environment, name),
  },
};

const ENVIRONMENT = "/api/projects/:id/manifests/:manifest/environments";
const VALUE = `${ENVIRONMENT}/:environment/:kind(variables|secrets)/:name`;
const DEPLOYS = `${ENVIRONMENT}/:environment/deploys`;
const CREDENTIAL = "/api/projects/:id/credentials/:name";

/** Where an environment is, once every step to it was found. */
interface Located {
  readonly manifest: Platform.Manifest;
  readonly environment: Platform.Environment;
}

/**
 * The platform's JSON API under `/api`. Reads answer from the stores
 * directly, and so do edits to what is stored; what someone asks the
 * platform to *do* is announced as an event (`OnProjectAdded`,
 * `OnSyncRequested`, `OnRunRequested`), which whoever was wired to it acts
 * on.
 *
 * A secret's value goes in, never out: a project shows which secrets each
 * environment holds, and which release credentials it has, not what they
 * are.
 */
export class Api {
  private readonly projectAdded = new Delegate<[Platform.Project]>();
  private readonly syncRequested = new Delegate<[Platform.Project]>();
  private readonly runRequested = new Delegate<[Platform.Run]>();

  constructor(
    private readonly projects: Kv.Projects,
    private readonly catalogs: Kv.Catalogs,
    private readonly syncs: Kv.Syncs,
    private readonly environments: Kv.Environments,
    private readonly values: Kv.Values,
    private readonly credentials: Kv.Credentials,
    private readonly runs: Kv.Runs,
    private readonly checkouts: Checkouts,
    private readonly feed: RunFeed,
    private readonly router: Router,
    endpoints: Endpoints,
  ) {
    const add = endpoints.add.bind(endpoints);
    add("GET", "/api/projects", () => this.listProjects());
    add(
      "POST",
      "/api/projects",
      (request) => this.addProject(request),
    );
    add("GET", "/api/projects/:id", (_, { id }) => this.project(id!));
    add(
      "POST",
      "/api/projects/:id/sync",
      (_, { id }) => this.requestSync(id!),
    );
    add(
      "POST",
      ENVIRONMENT,
      (request, params) => this.addEnvironment(request, params),
    );
    add(
      "PUT",
      VALUE,
      (request, params) => this.setValue(request, params),
    );
    add("DELETE", VALUE, (_, params) => this.unsetValue(params));
    add(
      "GET",
      "/api/projects/:id/versions",
      (_, { id }) => this.versions(id!),
    );
    add(
      "POST",
      DEPLOYS,
      (request, params) => this.requestDeploy(request, params),
    );
    add(
      "POST",
      "/api/projects/:id/releases",
      (request, { id }) => this.requestRelease(request, id!),
    );
    add(
      "PUT",
      CREDENTIAL,
      (request, params) => this.setCredential(request, params),
    );
    add(
      "DELETE",
      CREDENTIAL,
      (_, params) => this.unsetCredential(params),
    );
    add(
      "GET",
      "/api/projects/:id/runs",
      (_, { id }) => this.projectRuns(id!),
    );
    add("GET", "/api/routes", () => this.routingTable());
    add("GET", "/api/runs/:run", (_, { run }) => this.run(run!));
    add(
      "GET",
      "/api/runs/:run/events",
      (_, { run }) => this.followRun(run!),
    );
  }

  /** A project was added; it has no checkout yet. */
  get OnProjectAdded(): Emitter<[Platform.Project]> {
    return this.projectAdded;
  }

  /** Someone asked for a project to be brought up to date with its ref. */
  get OnSyncRequested(): Emitter<[Platform.Project]> {
    return this.syncRequested;
  }

  /** A deploy or a release was asked for and queued; it hasn't started. */
  get OnRunRequested(): Emitter<[Platform.Run]> {
    return this.runRequested;
  }

  private async listProjects(): Promise<Response> {
    const projects = await this.projects.list();
    return json(
      await Promise.all(projects.map(async (project) => ({
        ...this.describe(project),
        sync: await this.syncs.of(project.id),
      }))),
    );
  }

  private async addProject(request: Request): Promise<Response> {
    let project: Platform.Project;
    try {
      const body = await request.json();
      project = Platform.Project.create({
        id: String(body.id ?? ""),
        repository: String(body.repository ?? ""),
        ref: String(body.ref || "main"),
      });
    } catch (error) {
      return json({ error: messageOf(error) }, 400);
    }

    if (!await this.projects.add(project)) {
      return json({ error: `A project "${project.id}" exists already.` }, 409);
    }
    this.projectAdded.Invoke(project);
    return json(this.describe(project), 201);
  }

  private async project(id: string): Promise<Response> {
    const project = await this.projects.get(id);
    if (!project) return json({ error: "No such project" }, 404);

    const catalog = await this.catalogs.of(id);
    const environments = await this.environments.of(id);
    return json({
      ...this.describe(project),
      sync: await this.syncs.of(id),
      credentials: await this.credentials.names(id),
      catalog: catalog && {
        commit: catalog.commit,
        kits: catalog.kits,
        problems: catalog.problems,
        manifests: await Promise.all(
          catalog.manifests.map(async (manifest) => ({
            name: manifest.name,
            ships: manifest.ships,
            variables: manifest.variables,
            secrets: manifest.secrets,
            deployable: manifest.deployable,
            environments: await Promise.all(
              environments
                .filter((environment) => environment.manifest === manifest.name)
                .map((environment) =>
                  this.describeEnvironment(environment, manifest)
                ),
            ),
          })),
        ),
      },
    });
  }

  private async describeEnvironment(
    environment: Platform.Environment,
    manifest: Platform.Manifest,
  ) {
    const values = await this.values.of(environment);
    return {
      id: environment.id,
      name: environment.name,
      variables: Object.fromEntries(values.variables),
      secrets: [...values.secrets],
      missing: values.missingFor(manifest),
    };
  }

  private async requestSync(id: string): Promise<Response> {
    const project = await this.projects.get(id);
    if (!project) return json({ error: "No such project" }, 404);
    this.syncRequested.Invoke(project);
    return json({}, 202);
  }

  private async addEnvironment(
    request: Request,
    params: Params,
  ): Promise<Response> {
    const manifest = await this.manifestOf(params);
    if (manifest instanceof Response) return manifest;

    let environment: Platform.Environment;
    try {
      const body = await request.json();
      environment = Platform.Environment.create(
        params.id!,
        manifest.name,
        String(body.name ?? ""),
      );
    } catch (error) {
      return json({ error: messageOf(error) }, 400);
    }

    if (!await this.environments.add(environment)) {
      return json({
        error:
          `"${manifest.name}" has an environment "${environment.name}" already.`,
      }, 409);
    }
    return json(
      await this.describeEnvironment(environment, manifest),
      201,
    );
  }

  private async setValue(request: Request, params: Params): Promise<Response> {
    const located = await this.locate(params);
    if (located instanceof Response) return located;
    const kind = VALUE_KINDS[params.kind!];
    if (!kind.declares(located.manifest, params.name!)) {
      return json({
        error:
          `ci/${located.manifest.name} declares no ${params.kind} entry "${params.name}".`,
      }, 400);
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.value !== "string") {
      return json({ error: "A value is a string." }, 400);
    }
    await kind.set(this.values, located.environment, params.name!, body.value);
    return new Response(null, { status: 204 });
  }

  private async unsetValue(params: Params): Promise<Response> {
    const located = await this.locate(params);
    if (located instanceof Response) return located;
    await VALUE_KINDS[params.kind!].unset(
      this.values,
      located.environment,
      params.name!,
    );
    return new Response(null, { status: 204 });
  }

  private async versions(id: string): Promise<Response> {
    const project = await this.projects.get(id);
    if (!project) return json({ error: "No such project" }, 404);
    try {
      return json(await this.checkouts.versions(project));
    } catch (error) {
      return json({ error: messageOf(error) }, 502);
    }
  }

  private async requestDeploy(
    request: Request,
    params: Params,
  ): Promise<Response> {
    const located = await this.locate(params);
    if (located instanceof Response) return located;
    const catalog = await this.catalogs.of(params.id!);

    let deployment: Platform.Deployment;
    try {
      const body = await request.json();
      deployment = Platform.Deployment.create({
        project: params.id!,
        manifest: located.manifest.name,
        environment: located.environment.name,
        kit: String(body.kit ?? ""),
        version: String(body.version || "latest"),
        termination: String(body.termination ?? "apply"),
      });
    } catch (error) {
      return json({ error: messageOf(error) }, 400);
    }
    if (!catalog?.kits.includes(deployment.kit)) {
      return json({
        error: `"${params.id}" has no deploy kit "${deployment.kit}".`,
      }, 400);
    }

    return await this.queue(deployment);
  }

  private async requestRelease(
    request: Request,
    id: string,
  ): Promise<Response> {
    if (!await this.projects.get(id)) {
      return json({ error: "No such project" }, 404);
    }
    let release: Platform.Release;
    try {
      const body = await request.json();
      release = Platform.Release.create({
        project: id,
        action: String(body.action ?? ""),
        argument: String(body.argument ?? ""),
      });
    } catch (error) {
      return json({ error: messageOf(error) }, 400);
    }
    return await this.queue(release);
  }

  private async queue(work: Platform.Work): Promise<Response> {
    const run = Platform.Run.queue(work);
    await this.runs.save(run);
    this.runRequested.Invoke(run);
    return json(RunView.of(run), 202);
  }

  private async setCredential(
    request: Request,
    params: Params,
  ): Promise<Response> {
    if (!await this.projects.get(params.id!)) {
      return json({ error: "No such project" }, 404);
    }
    const body = await request.json().catch(() => ({}));
    if (typeof body.value !== "string") {
      return json({ error: "A value is a string." }, 400);
    }
    try {
      await this.credentials.set(params.id!, params.name!, body.value);
    } catch (error) {
      return json({ error: messageOf(error) }, 400);
    }
    return new Response(null, { status: 204 });
  }

  private async unsetCredential(params: Params): Promise<Response> {
    await this.credentials.unset(params.id!, params.name!);
    return new Response(null, { status: 204 });
  }

  /** What the router routes, and what it was told it couldn't. */
  private async routingTable(): Promise<Response> {
    const table = await this.router.table();
    return json({
      routes: table.routes,
      conflicts: table.conflicts,
      rejections: table.rejections,
    });
  }

  private async projectRuns(id: string): Promise<Response> {
    return json((await this.runs.of(id)).map((run) => RunView.of(run)));
  }

  private async run(id: string): Promise<Response> {
    const run = await this.runs.get(id);
    if (!run) return json({ error: "No such run" }, 404);
    return json({ ...RunView.of(run), lines: await this.runs.lines(id) });
  }

  private async followRun(id: string): Promise<Response> {
    return await this.feed.follow(id) ?? json({ error: "No such run" }, 404);
  }

  /** The manifest `params` name, as the project's last sync found it. */
  private async manifestOf(
    params: Params,
  ): Promise<Platform.Manifest | Response> {
    const catalog = await this.catalogs.of(params.id!);
    const manifest = catalog?.manifests.find((found) =>
      found.name === params.manifest
    );
    return manifest ?? json({ error: "No such manifest" }, 404);
  }

  private async locate(params: Params): Promise<Located | Response> {
    const manifest = await this.manifestOf(params);
    if (manifest instanceof Response) return manifest;
    const environment = await this.environments.get(
      params.id!,
      manifest.name,
      params.environment!,
    );
    if (!environment) return json({ error: "No such environment" }, 404);
    return { manifest, environment };
  }

  private describe(project: Platform.Project) {
    return { id: project.id, repository: project.repository, ref: project.ref };
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
