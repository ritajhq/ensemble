import { Delegate, type Emitter } from "@duesabati/evento";
import type * as Platform from "@ensemble/platform";
import type { Endpoints } from "./endpoints.ts";
import * as Github from "./github/index.ts";
import type * as Kv from "./kv.ts";

/** How a body names the account an app is created under. */
const OWNERS: Readonly<
  Record<string, (login: string) => Github.Owner>
> = {
  user: () => ({ kind: "user" }),
  organization: (login) => ({ kind: "organization", login }),
};

/**
 * The platform's GitHub App, as the API shows and sets it up — whether there
 * is one, beginning its creation on GitHub and finishing it when GitHub sends
 * its operator back, the repositories it can reach — and the app's webhook,
 * `POST /hooks/github`, for every repository it's installed on. A branch
 * pushed or deleted in a project's repository is announced for each project
 * of that repository (`OnBranchPushed`, `OnBranchDeleted`), for whoever was
 * wired to it to act on.
 */
export class GithubApi {
  private readonly branchPushed = new Delegate<[Platform.Project, string]>();
  private readonly branchDeleted = new Delegate<[Platform.Project, string]>();

  /** Each branch event, as what is announced for it. */
  private readonly announcements: Readonly<
    Record<Github.BranchEvent["kind"], Delegate<[Platform.Project, string]>>
  > = {
    pushed: this.branchPushed,
    deleted: this.branchDeleted,
  };

  constructor(
    private readonly apps: Github.Apps,
    private readonly setup: Github.Setup,
    private readonly tokens: Github.Tokens,
    private readonly webhook: Github.Webhook,
    private readonly projects: Kv.Projects,
    endpoints: Endpoints,
  ) {
    const add = endpoints.add.bind(endpoints);
    add("GET", "/api/github", () => this.show());
    add("POST", "/api/github/setup", (request) => this.begin(request));
    add("GET", "/api/github/created", (request) => this.created(request));
    add("GET", "/api/github/repositories", () => this.repositories());
    add("POST", "/hooks/github", (request) => this.deliver(request));
  }

  get OnBranchPushed(): Emitter<[Platform.Project, string]> {
    return this.branchPushed;
  }

  get OnBranchDeleted(): Emitter<[Platform.Project, string]> {
    return this.branchDeleted;
  }

  /** The app, if there is one: never its secrets. */
  private async show(): Promise<Response> {
    const app = await this.apps.get();
    return json({
      app: app
        ? {
          slug: app.slug,
          owner: app.owner,
          htmlUrl: app.htmlUrl,
          installUrl: app.installUrl,
        }
        : null,
    });
  }

  private async begin(request: Request): Promise<Response> {
    if (await this.apps.get()) {
      return json({ error: "The platform has its GitHub App already." }, 409);
    }
    const body = await request.json().catch(() => ({}));
    const owner = OWNERS[String(body.owner ?? "")];
    if (!owner) {
      return json({ error: 'The owner is "user" or "organization".' }, 400);
    }
    try {
      return json(
        await this.setup.begin(
          owner(String(body.organization ?? "").trim()),
          String(body.name ?? "").trim(),
        ),
      );
    } catch (error) {
      if (error instanceof Github.SetupError) {
        return json({ error: error.message }, 400);
      }
      throw error;
    }
  }

  /** Where GitHub sends the operator back once it created the app: kept, then on to installing it. */
  private async created(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return new Response("GitHub sent no code back.", { status: 400 });
    }
    try {
      const app = await this.setup.complete(code, state);
      return Response.redirect(app.installUrl, 302);
    } catch (error) {
      if (error instanceof Github.SetupError) {
        return new Response(error.message, { status: 400 });
      }
      throw error;
    }
  }

  private async repositories(): Promise<Response> {
    try {
      return json(await this.tokens.repositories());
    } catch (error) {
      if (error instanceof Github.NoAppError) {
        return json({ error: error.message }, 409);
      }
      throw error;
    }
  }

  private async deliver(request: Request): Promise<Response> {
    const { response, event } = await this.webhook.interpret(request);
    if (!event) return response;
    const repository = event.repository.toLowerCase();
    for (const project of await this.projects.list()) {
      if (project.repository.toLowerCase() !== repository) continue;
      this.announcements[event.kind].Invoke(project, event.branch);
    }
    return response;
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
