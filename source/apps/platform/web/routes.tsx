import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  redirect,
  type RouteObject,
} from "react-router";
import {
  type Api,
  describe,
  type Operator,
  type Project,
  type ProjectPreviews,
  type ProjectSummary,
  type Repository,
  type RoutingTable,
  type Run,
} from "./api.ts";
import * as Paths from "./paths.ts";
import { Shell } from "./shell.tsx";
import { ScreenError } from "./screens/screen-error.tsx";
import { Overview } from "./screens/overview.tsx";
import { Projects } from "./screens/projects.tsx";
import { AddProject, type AddProjectOutcome } from "./screens/add-project.tsx";
import { ProjectScreen } from "./screens/project.tsx";
import { RunScreen } from "./screens/run.tsx";

/** The shell's route, for screens that read what it loaded. */
export const SHELL_ROUTE = "shell";

/** What the shell loads for every screen: the projects the sidebar lists. */
export interface ShellData {
  readonly projects: readonly ProjectSummary[];
  /** Who is signed in; none when nothing guards the platform (a local run). */
  readonly operator?: Operator;
}

/** What the overview loads: the router's table. */
export interface OverviewData {
  readonly table: RoutingTable;
}

/** What adding a project loads: the repositories the GitHub App can reach, or why it can't. */
export interface AddProjectData {
  readonly value?: readonly Repository[];
  readonly error?: string;
}

/** What a project's screen loads: the project, and what has been done with it. */
export interface ProjectData {
  readonly project: Project;
  readonly versions: readonly string[];
  readonly runs: readonly Run[];
  readonly previews?: ProjectPreviews;
}

/** What each screen is called in the top bar. */
export interface ScreenHandle {
  title(params: Readonly<Record<string, string | undefined>>): string;
}

/**
 * The platform's screens, each with what it loads before it shows: the
 * sidebar's projects at the root, and every screen beneath it inside one
 * error boundary, so a failed screen keeps the sidebar.
 */
export class Screens {
  constructor(private readonly api: Api) {}

  routes(): RouteObject[] {
    return [{
      id: SHELL_ROUTE,
      path: "/",
      Component: Shell,
      HydrateFallback: () => null,
      loader: () => this.shell(),
      children: [{
        ErrorBoundary: ScreenError,
        children: [
          {
            index: true,
            Component: Overview,
            loader: () => this.overview(),
            handle: { title: () => "Overview" } satisfies ScreenHandle,
          },
          {
            path: "projects",
            Component: Projects,
            handle: { title: () => "Projects" } satisfies ScreenHandle,
          },
          {
            path: "new",
            Component: AddProject,
            loader: () => this.repositories(),
            action: (args) => this.addProject(args),
            handle: { title: () => "Add a project" } satisfies ScreenHandle,
          },
          {
            path: "projects/:id",
            Component: ProjectScreen,
            loader: (args) => this.project(args),
            handle: { title: ({ id }) => id ?? "" } satisfies ScreenHandle,
          },
          {
            path: "runs/:id",
            Component: RunScreen,
            handle: { title: () => "Run" } satisfies ScreenHandle,
          },
          {
            path: "*",
            loader: () => {
              throw data("Nothing lives here", { status: 404 });
            },
            handle: { title: () => "Not found" } satisfies ScreenHandle,
          },
        ],
      }],
    }];
  }

  private async shell(): Promise<ShellData> {
    // The sidebar is chrome: a failed list leaves it empty, and the screen
    // beneath it still says what went wrong.
    const [projects, operator] = await Promise.all([
      this.api.projects().catch(() => []),
      this.api.session().catch(() => undefined),
    ]);
    return { projects, operator };
  }

  private async overview(): Promise<OverviewData> {
    return { table: await this.api.routes() };
  }

  private async repositories(): Promise<AddProjectData> {
    // Not reaching GitHub is something the screen explains, not a failure.
    try {
      return { value: await this.api.repositories() };
    } catch (e) {
      return { error: describe(e) };
    }
  }

  private async project({ params }: LoaderFunctionArgs): Promise<ProjectData> {
    const id = params.id ?? "";
    const [project, versions, runs, previews] = await Promise.all([
      this.api.project(id),
      this.api.versions(id).catch(() => []),
      this.api.runs(id).catch(() => []),
      this.api.previews(id).catch(() => undefined),
    ]);
    return { project, versions, runs, previews };
  }

  private async addProject(
    { request }: ActionFunctionArgs,
  ): Promise<AddProjectOutcome | Response> {
    const form = await request.formData();
    try {
      const project = await this.api.addProject({
        id: String(form.get("id") ?? "").trim(),
        repository: String(form.get("repository") ?? ""),
        ref: String(form.get("ref") ?? "").trim(),
      });
      return redirect(Paths.project(project.id));
    } catch (e) {
      return { error: describe(e) };
    }
  }
}
