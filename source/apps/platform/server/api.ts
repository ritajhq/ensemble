import { Delegate, type Emitter } from "@duesabati/evento";
import * as Platform from "@ensemble/platform";
import type * as Kv from "./kv.ts";

/** One route: what it answers and how. */
interface Route {
  readonly method: string;
  readonly pattern: URLPattern;
  readonly answer: (
    request: Request,
    params: Readonly<Record<string, string | undefined>>,
  ) => Promise<Response>;
}

/**
 * The platform's JSON API under `/api`. Reads answer from the stores
 * directly; what someone asks the platform to *do* is announced as an event
 * (`OnProjectAdded`, `OnSyncRequested`), which whoever was wired to it acts
 * on.
 */
export class Api {
  private readonly projectAdded = new Delegate<[Platform.Project]>();
  private readonly syncRequested = new Delegate<[Platform.Project]>();
  private readonly routes: readonly Route[];

  constructor(
    private readonly projects: Kv.Projects,
    private readonly catalogs: Kv.Catalogs,
    private readonly syncs: Kv.Syncs,
    private readonly environments: Kv.Environments,
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
        manifests: catalog.manifests.map((manifest) => ({
          name: manifest.name,
          ships: manifest.ships,
          variables: manifest.variables,
          secrets: manifest.secrets,
          environments: environments
            .filter((environment) => environment.manifest === manifest.name)
            .map(({ id, name }) => ({ id, name })),
        })),
      },
    });
  }

  private async requestSync(id: string): Promise<Response> {
    const project = await this.projects.get(id);
    if (!project) return json({ error: "No such project" }, 404);
    this.syncRequested.Invoke(project);
    return json({}, 202);
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
