import { Delegate, type Emitter } from "@duesabati/evento";
import * as Platform from "@ensemble/platform";
import type { Checkouts } from "./checkouts.ts";
import type * as Kv from "./kv.ts";
import { type RunFeed, RunView } from "./run-feed.ts";

type Params = Readonly<Record<string, string | undefined>>;

/** One route: what it answers and how. */
interface Route {
  readonly method: string;
  readonly pattern: URLPattern;
  readonly answer: (request: Request, params: Params) => Promise<Response>;
}

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

/** Where an environment is, once every step to it was found. */
interface Located {
  readonly manifest: Platform.Manifest;
  readonly environment: Platform.Environment;
}

/**
 * The platform's JSON API under `/api`. Reads answer from the stores
 * directly, and so do edits to what is stored; what someone asks the
 * platform to *do* is announced as an event (`OnProjectAdded`,
 * `OnSyncRequested`, `OnDeployRequested`), which whoever was wired to it
 * acts on.
 *
 * A secret's value goes in, never out: a project shows which secrets each
 * environment holds, not what they are.
 */
export class Api {
  private readonly projectAdded = new Delegate<[Platform.Project]>();
  private readonly syncRequested = new Delegate<[Platform.Project]>();
  private readonly deployRequested = new Delegate<[Platform.Run]>();
  private readonly routes: readonly Route[];

  constructor(
    private readonly projects: Kv.Projects,
    private readonly catalogs: Kv.Catalogs,
    private readonly syncs: Kv.Syncs,
    private readonly environments: Kv.Environments,
    private readonly values: Kv.Values,
    private readonly runs: Kv.Runs,
    private readonly checkouts: Checkouts,
    private readonly feed: RunFeed,
  ) {
    this.routes = [
      this.route("GET", "/api/projects", () => this.listProjects()),
      this.route(
        "POST",
        "/api/projects",
        (request) => this.addProject(request),
      ),
      this.route("GET", "/api/projects/:id", (_, { id }) => this.project(id!)),
      this.route(
        "POST",
        "/api/projects/:id/sync",
        (_, { id }) => this.requestSync(id!),
      ),
      this.route(
        "POST",
        ENVIRONMENT,
        (request, params) => this.addEnvironment(request, params),
      ),
      this.route(
        "PUT",
        VALUE,
        (request, params) => this.setValue(request, params),
      ),
      this.route("DELETE", VALUE, (_, params) => this.unsetValue(params)),
      this.route(
        "GET",
        "/api/projects/:id/versions",
        (_, { id }) => this.versions(id!),
      ),
      this.route(
        "POST",
        DEPLOYS,
        (request, params) => this.requestDeploy(request, params),
      ),
      this.route(
        "GET",
        "/api/projects/:id/runs",
        (_, { id }) => this.projectRuns(id!),
      ),
      this.route("GET", "/api/runs/:run", (_, { run }) => this.run(run!)),
      this.route(
        "GET",
        "/api/runs/:run/events",
        (_, { run }) => this.followRun(run!),
      ),
    ];
  }

  /** A project was added; it has no checkout yet. */
  get OnProjectAdded(): Emitter<[Platform.Project]> {
    return this.projectAdded;
  }

  /** Someone asked for a project to be brought up to date with its ref. */
  get OnSyncRequested(): Emitter<[Platform.Project]> {
    return this.syncRequested;
  }

  /** A deploy was asked for and queued; it hasn't started. */
  get OnDeployRequested(): Emitter<[Platform.Run]> {
    return this.deployRequested;
  }

  async handle(request: Request): Promise<Response> {
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(request.url);
      if (match) return await route.answer(request, match.pathname.groups);
    }
    return json({ error: "Not found" }, 404);
  }

  private route(
    method: string,
    pathname: string,
    answer: Route["answer"],
  ): Route {
    return { method, pattern: new URLPattern({ pathname }), answer };
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

    const run = Platform.Run.queue(deployment);
    await this.runs.save(run);
    this.deployRequested.Invoke(run);
    return json(RunView.of(run), 202);
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
