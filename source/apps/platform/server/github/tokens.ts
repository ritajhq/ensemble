import type { App } from "./app.ts";
import type { Apps } from "./apps.ts";
import { RefusedError, type Rest } from "./rest.ts";

/** How long before its expiry a token is no longer handed out: long enough for a clone, a fetch or a push to finish with it. */
const MARGIN_MS = 10 * 60 * 1000;

/** Thrown when the platform needs GitHub before its app was set up. */
export class NoAppError extends Error {
  constructor() {
    super(
      "The platform has no GitHub App yet: set one up on the platform's home page first.",
    );
    this.name = "NoAppError";
  }
}

/** Thrown when the app isn't installed where a repository lives, or not on that repository. */
export class NotInstalledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotInstalledError";
  }
}

/** A repository the app can reach, as the project picker lists it. */
export interface Repository {
  /** `owner/name`. */
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly private: boolean;
}

/** An installation's token, until a little before it expires. */
class InstallationToken {
  constructor(readonly value: string, private readonly expiresAt: Date) {}

  fresh(at: Date = new Date()): boolean {
    return this.expiresAt.getTime() - at.getTime() > MARGIN_MS;
  }
}

interface AccessTokenAnswer {
  readonly token: string;
  readonly expires_at: string;
}

interface InstallationRepositoriesAnswer {
  readonly total_count: number;
  readonly repositories: readonly {
    readonly full_name: string;
    readonly default_branch: string;
    readonly private: boolean;
  }[];
}

/**
 * The tokens the platform reaches GitHub with: each one an installation's,
 * for the repositories the app was installed on, good for an hour and issued
 * again as it runs out. What clones, fetches, release pushes and `gh` are
 * authorized with.
 */
export class Tokens {
  private readonly tokens = new Map<number, InstallationToken>();
  /** Which installation reaches each repository (`owner/name`, lowercase). */
  private readonly installations = new Map<string, number>();

  constructor(private readonly apps: Apps, private readonly rest: Rest) {}

  /** A token for `repository` (`owner/name`), good for at least a few more minutes. */
  async for(repository: string): Promise<string> {
    const app = await this.app();
    return await this.ofInstallation(
      app,
      await this.installationOf(app, repository),
    );
  }

  /** Every repository the app is installed on, across every account it's installed in. */
  async repositories(): Promise<Repository[]> {
    const app = await this.app();
    const installations = await this.rest.call<readonly { id: number }[]>(
      "GET",
      "/app/installations?per_page=100",
      { kind: "app", jwt: await app.jwt() },
    );
    const repositories: Repository[] = [];
    for (const { id } of installations) {
      const token = await this.ofInstallation(app, id);
      for (let page = 1;; page++) {
        const answer = await this.rest.call<InstallationRepositoriesAnswer>(
          "GET",
          `/installation/repositories?per_page=100&page=${page}`,
          { kind: "installation", token },
        );
        for (const repository of answer.repositories) {
          this.installations.set(repository.full_name.toLowerCase(), id);
          repositories.push({
            fullName: repository.full_name,
            defaultBranch: repository.default_branch,
            private: repository.private,
          });
        }
        if (answer.repositories.length < 100) break;
      }
    }
    return repositories.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  private async app(): Promise<App> {
    const app = await this.apps.get();
    if (!app) throw new NoAppError();
    return app;
  }

  private async installationOf(app: App, repository: string): Promise<number> {
    const known = this.installations.get(repository.toLowerCase());
    if (known !== undefined) return known;
    try {
      const { id } = await this.rest.call<{ id: number }>(
        "GET",
        `/repos/${repository}/installation`,
        { kind: "app", jwt: await app.jwt() },
      );
      this.installations.set(repository.toLowerCase(), id);
      return id;
    } catch (error) {
      if (!(error instanceof RefusedError) || error.status !== 404) throw error;
      throw new NotInstalledError(
        `The GitHub App "${app.slug}" isn't installed on ${repository}: install it there (${app.installUrl}).`,
      );
    }
  }

  private async ofInstallation(
    app: App,
    installation: number,
  ): Promise<string> {
    const kept = this.tokens.get(installation);
    if (kept?.fresh()) return kept.value;
    const answer = await this.rest.call<AccessTokenAnswer>(
      "POST",
      `/app/installations/${installation}/access_tokens`,
      { kind: "app", jwt: await app.jwt() },
    );
    const token = new InstallationToken(
      answer.token,
      new Date(answer.expires_at),
    );
    this.tokens.set(installation, token);
    return token.value;
  }
}
