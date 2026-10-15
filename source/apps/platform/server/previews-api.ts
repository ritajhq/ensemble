import * as Platform from "@ensemble/platform";
import type { Endpoints, Params } from "./endpoints.ts";
import { GithubWebhook } from "./github-webhook.ts";
import type * as Kv from "./kv.ts";
import type { Previews } from "./previews.ts";
import { RunView } from "./run-feed.ts";

const SETTINGS = "/api/projects/:id/manifests/:manifest/previews";
const WEBHOOK_SECRET = "/api/projects/:id/webhook-secret";

/** What a webhook's branch event asks of `Previews`. */
const BRANCH_EVENTS: Readonly<
  Record<
    "pushed" | "deleted",
    (previews: Previews, project: string, branch: string) => Promise<unknown>
  >
> = {
  pushed: (previews, project, branch) => previews.pushed(project, branch),
  deleted: (previews, project, branch) => previews.deleted(project, branch),
};

/**
 * The previews part of the platform's API: how each manifest is previewed,
 * the previews that are up, previewing a branch (or taking it down) by hand,
 * and GitHub's webhook — `POST /hooks/github/<project>`, verified with the
 * project's own secret — doing the same on every push and branch deletion.
 */
export class PreviewsApi {
  constructor(
    private readonly projects: Kv.Projects,
    private readonly catalogs: Kv.Catalogs,
    private readonly environments: Kv.Environments,
    private readonly settings: Kv.PreviewSettings,
    private readonly live: Kv.LivePreviews,
    private readonly secrets: Kv.WebhookSecrets,
    private readonly previews: Previews,
    endpoints: Endpoints,
  ) {
    const add = endpoints.add.bind(endpoints);
    add("GET", "/api/projects/:id/previews", (_, { id }) => this.show(id!));
    add("PUT", SETTINGS, (request, params) => this.configure(request, params));
    add("DELETE", SETTINGS, (_, params) => this.stop(params));
    add(
      "POST",
      "/api/projects/:id/previews",
      (request, { id }) => this.preview(request, id!),
    );
    add(
      "POST",
      "/api/projects/:id/previews/destroy",
      (request, { id }) => this.takeDown(request, id!),
    );
    add(
      "PUT",
      WEBHOOK_SECRET,
      (request, { id }) => this.setSecret(request, id!),
    );
    add("DELETE", WEBHOOK_SECRET, (_, { id }) => this.unsetSecret(id!));
    add(
      "POST",
      "/hooks/github/:id",
      (request, { id }) => this.hook(request, id!),
    );
  }

  private async show(id: string): Promise<Response> {
    if (!await this.projects.get(id)) return notFound("project");
    return json({
      webhook: {
        path: `/hooks/github/${encodeURIComponent(id)}`,
        secret: await this.secrets.has(id),
      },
      settings: (await this.settings.of(id)).map((settings) => ({
        manifest: settings.manifest,
        branches: settings.branches,
        base: settings.base,
        kit: settings.kit,
        overrides: settings.overrides,
      })),
      live: await this.live.of(id),
    });
  }

  private async configure(request: Request, params: Params): Promise<Response> {
    const catalog = await this.catalogs.of(params.id!);
    const manifest = catalog?.manifests.find((found) =>
      found.name === params.manifest
    );
    if (!manifest) return notFound("manifest");

    let settings: Platform.PreviewSettings;
    try {
      const body = await request.json();
      settings = Platform.PreviewSettings.create({
        project: params.id!,
        manifest: manifest.name,
        branches: Array.isArray(body.branches) ? body.branches.map(String) : [],
        base: String(body.base ?? ""),
        kit: String(body.kit ?? ""),
        overrides: Object.fromEntries(
          Object.entries(body.overrides ?? {}).map((
            [name, template],
          ) => [name, String(template)]),
        ),
      });
    } catch (error) {
      return json({ error: messageOf(error) }, 400);
    }

    const refusal = await this.refusalOf(settings, manifest, catalog!.kits);
    if (refusal) return json({ error: refusal }, 400);
    await this.settings.set(settings);
    return new Response(null, { status: 204 });
  }

  /** Why `settings` can't be kept for `manifest`, if anything: what only the project knows about. */
  private async refusalOf(
    settings: Platform.PreviewSettings,
    manifest: Platform.Manifest,
    kits: readonly string[],
  ): Promise<string | undefined> {
    if (!manifest.deployable) {
      return `ci/${manifest.name} declares nothing to deploy.`;
    }
    if (!kits.includes(settings.kit)) {
      return `The project has no deploy kit "${settings.kit}".`;
    }
    const base = await this.environments.get(
      settings.project,
      manifest.name,
      settings.base,
    );
    if (!base) {
      return `ci/${manifest.name} has no environment "${settings.base}".`;
    }
    const undeclared = Object.keys(settings.overrides).filter((name) =>
      !manifest.declaresVariable(name)
    );
    if (undeclared.length > 0) {
      return `ci/${manifest.name} declares no variable ${
        undeclared.join(", ")
      }.`;
    }
    return undefined;
  }

  private async stop(params: Params): Promise<Response> {
    await this.settings.remove(params.id!, params.manifest!);
    return new Response(null, { status: 204 });
  }

  private async preview(request: Request, id: string): Promise<Response> {
    if (!await this.projects.get(id)) return notFound("project");
    const branch = await this.branchOf(request);
    if (!branch) return json({ error: "Name a branch." }, 400);
    const runs = await this.previews.pushed(id, branch);
    if (runs.length === 0) {
      return json({ error: `No manifest previews "${branch}".` }, 400);
    }
    return json(runs.map((run) => RunView.of(run)), 202);
  }

  private async takeDown(request: Request, id: string): Promise<Response> {
    if (!await this.projects.get(id)) return notFound("project");
    const branch = await this.branchOf(request);
    if (!branch) return json({ error: "Name a branch." }, 400);
    const runs = await this.previews.deleted(id, branch);
    return json(runs.map((run) => RunView.of(run)), 202);
  }

  private async setSecret(request: Request, id: string): Promise<Response> {
    if (!await this.projects.get(id)) return notFound("project");
    const body = await request.json().catch(() => ({}));
    if (typeof body.value !== "string" || body.value.length < 16) {
      return json(
        { error: "A webhook secret is at least 16 characters." },
        400,
      );
    }
    await this.secrets.set(id, body.value);
    return new Response(null, { status: 204 });
  }

  private async unsetSecret(id: string): Promise<Response> {
    await this.secrets.unset(id);
    return new Response(null, { status: 204 });
  }

  /** GitHub's push and delete events for one project, each verified with that project's own secret. */
  private async hook(request: Request, id: string): Promise<Response> {
    const project = await this.projects.get(id);
    const secret = project && await this.secrets.reveal(id);
    if (!project || !secret) {
      return new Response("Unknown project", { status: 404 });
    }
    const { response, event } = await new GithubWebhook(
      secret,
      project.repository,
    ).interpret(request);
    if (event) await BRANCH_EVENTS[event.kind](this.previews, id, event.branch);
    return response;
  }

  private async branchOf(request: Request): Promise<string | undefined> {
    const body = await request.json().catch(() => ({}));
    const branch = typeof body.branch === "string" ? body.branch.trim() : "";
    return branch || undefined;
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function notFound(what: string): Response {
  return json({ error: `No such ${what}` }, 404);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
