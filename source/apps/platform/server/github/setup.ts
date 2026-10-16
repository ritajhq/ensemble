import { Delegate, type Emitter } from "@duesabati/evento";
import { App } from "./app.ts";
import type { Apps } from "./apps.ts";
import type { Rest } from "./rest.ts";

/** Thrown when a setup can't be begun as asked, or comes back from GitHub as none this platform sent. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

/** A GitHub login: a user's or an organization's. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** What GitHub lets an app be called. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,33}$/;

/** Who an app is created under: the operator's own account, or an organization they administer. */
export type Owner =
  | { readonly kind: "user" }
  | { readonly kind: "organization"; readonly login: string };

/** Where GitHub's app-creation page is for each kind of owner: the setup's form is posted there. */
const CREATION_PAGES: {
  readonly [K in Owner["kind"]]: (owner: Extract<Owner, { kind: K }>) => string;
} = {
  user: () => "https://github.com/settings/apps/new",
  organization: ({ login }) =>
    `https://github.com/organizations/${login}/settings/apps/new`,
};

/** A setup sent to GitHub: the form the operator's browser posts, there. */
export interface Begun {
  /** Where the form goes, `state` included. */
  readonly action: string;
  /** The app's manifest, as the form's `manifest` field. */
  readonly manifest: string;
}

interface ConversionAnswer {
  readonly id: number;
  readonly slug: string;
  readonly owner: { readonly login: string };
  readonly html_url: string;
  readonly pem: string;
  readonly webhook_secret: string;
}

/**
 * Creating the platform's GitHub App with GitHub's manifest flow: the
 * platform describes the app — its webhook, what it may do, where GitHub
 * sends its operator back — the operator's browser posts that to GitHub, who
 * asks them to confirm, creates the app, and sends them back with a one-time
 * code the platform trades for the app's id and secrets. Announces the app
 * once it is kept.
 */
export class Setup {
  private readonly created = new Delegate<[App]>();

  constructor(
    private readonly apps: Apps,
    private readonly rest: Rest,
    /** Where the platform answers outside — `https://platform.example.com` — for the app's webhook and the way back. */
    private readonly platformUrl: string,
  ) {}

  get OnCreated(): Emitter<[App]> {
    return this.created;
  }

  /** The form that creates an app called `name` under `owner`, once its operator confirms it on GitHub. */
  async begin(owner: Owner, name: string): Promise<Begun> {
    if (owner.kind === "organization" && !LOGIN.test(owner.login)) {
      throw new SetupError(
        `"${owner.login}" isn't a GitHub organization's login.`,
      );
    }
    if (!NAME.test(name)) {
      throw new SetupError(
        `"${name}" can't name a GitHub App: up to 34 letters, digits, spaces, dots, hyphens and underscores.`,
      );
    }
    const state = crypto.randomUUID();
    await this.apps.expect(state);
    const page = (CREATION_PAGES[owner.kind] as (owner: Owner) => string)(
      owner,
    );
    return {
      action: `${page}?state=${state}`,
      manifest: JSON.stringify(this.manifest(name)),
    };
  }

  /** Trades the code GitHub sent its operator back with for the app it created, and keeps it. */
  async complete(code: string, state: string): Promise<App> {
    if (!await this.apps.awaited(state)) {
      throw new SetupError(
        "This setup wasn't begun here, or was finished already: begin it again.",
      );
    }
    const answer = await this.rest.call<ConversionAnswer>(
      "POST",
      `/app-manifests/${encodeURIComponent(code)}/conversions`,
      { kind: "none" },
    );
    const bot = await this.rest.call<{ id: number }>(
      "GET",
      `/users/${encodeURIComponent(`${answer.slug}[bot]`)}`,
      { kind: "none" },
    );
    const app = App.of({
      id: answer.id,
      slug: answer.slug,
      owner: answer.owner.login,
      htmlUrl: answer.html_url,
      botId: bot.id,
      privateKey: answer.pem,
      webhookSecret: answer.webhook_secret,
    });
    await this.apps.save(app);
    this.created.Invoke(app);
    return app;
  }

  /**
   * What the app is: private to its owner; told of every push and branch
   * deletion in the repositories it's installed on, at the platform's one
   * webhook; allowed to read and write their contents — clone, fetch, push
   * a release's commits and tags, publish its GitHub release — and nothing
   * else.
   */
  private manifest(name: string): Record<string, unknown> {
    return {
      name,
      url: this.platformUrl,
      hook_attributes: {
        url: `${this.platformUrl}/hooks/github`,
        active: true,
      },
      redirect_url: `${this.platformUrl}/api/github/created`,
      setup_url: `${this.platformUrl}/`,
      setup_on_update: true,
      public: false,
      default_permissions: { contents: "write", metadata: "read" },
      default_events: ["push", "delete"],
    };
  }
}
