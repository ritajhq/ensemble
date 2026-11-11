import type { App } from "./app.ts";
import type { Apps } from "./apps.ts";
import { RefusedError, type Rest } from "./rest.ts";

/** How long before its expiry a token is no longer handed out: long enough for a clone, a fetch or a push to finish with it. */
const MARGIN_MS = 10 * 60 * 1000;

/** Thrown when the platform needs GitHub before its app was set up. */
export class NoAppError extends Error {
  constructor() {
    super(
      "The platform has no GitHub App yet: set one up under Integrations › GitHub first.",
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

/** Which app reaches a repository, and through which of its installations. */
interface Reach {
  readonly app: App;
  readonly installation: number;
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
 * for the repositories one of its apps was installed on, good for an hour and
 * issued again as it runs out. What clones, fetches, release pushes and `gh`
 * are authorized with.
 */
export class Tokens {
  private readonly tokens = new Map<number, InstallationToken>();
  /** Which app and installation reach each repository (`owner/name`, lowercase). */
  private readonly reaches = new Map<string, Reach>();

  constructor(private readonly apps: Apps, private readonly rest: Rest) {}

  /** A token for `repository` (`owner/name`), good for at least a few more minutes. */
  async for(repository: string): Promise<string> {
    const { app, installation } = await this.reachOf(repository);
    return await this.ofInstallation(app, installation);
  }

  /** The app that reaches `repository`: whose bot a release of it commits as. */
  async appFor(repository: string): Promise<App> {
    return (await this.reachOf(repository)).app;
  }

  /** Every repository any app is installed on, across every account each is installed in; one reached by two apps is listed once. */
  async repositories(): Promise<Repository[]> {
    const listed = new Map<string, Repository>();
    for (const app of await this.everyApp()) {
      const installations = await this.rest.call<readonly { id: number }[]>(
        "GET",
        "/app/installations?per_page=100",
        { kind: "app", jwt: await app.jwt() },
      );
      for (const { id } of installations) {
        for (const repository of await this.repositoriesOf(app, id)) {
          const key = repository.fullName.toLowerCase();
          if (listed.has(key)) continue;
          this.reaches.set(key, { app, installation: id });
          listed.set(key, repository);
        }
      }
    }
    return [...listed.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }

  private async repositoriesOf(
    app: App,
    installation: number,
  ): Promise<Repository[]> {
    const token = await this.ofInstallation(app, installation);
    const repositories: Repository[] = [];
    for (let page = 1;; page++) {
      const answer = await this.rest.call<InstallationRepositoriesAnswer>(
        "GET",
        `/installation/repositories?per_page=100&page=${page}`,
        { kind: "installation", token },
      );
      repositories.push(...answer.repositories.map((repository) => ({
        fullName: repository.full_name,
        defaultBranch: repository.default_branch,
        private: repository.private,
      })));
      if (answer.repositories.length < 100) return repositories;
    }
  }

  private async everyApp(): Promise<App[]> {
    const apps = await this.apps.list();
    if (apps.length === 0) throw new NoAppError();
    return apps;
  }

  /** Which app reaches `repository`: the first, in the order they were set up, installed on it. */
  private async reachOf(repository: string): Promise<Reach> {
    const known = this.reaches.get(repository.toLowerCase());
    if (known) return known;
    const apps = await this.everyApp();
    for (const app of apps) {
      const installation = await this.installationOf(app, repository);
      if (installation === undefined) continue;
      const reach = { app, installation };
      this.reaches.set(repository.toLowerCase(), reach);
      return reach;
    }
    throw new NotInstalledError(
      `No GitHub App of the platform is installed on ${repository}: install ${
        apps.map((app) => `"${app.slug}" (${app.installUrl})`).join(" or ")
      } there, or set up an app under its owner's account.`,
    );
  }

  /** The installation of `app` that reaches `repository`; none when it isn't installed there. */
  private async installationOf(
    app: App,
    repository: string,
  ): Promise<number | undefined> {
    try {
      const { id } = await this.rest.call<{ id: number }>(
        "GET",
        `/repos/${repository}/installation`,
        { kind: "app", jwt: await app.jwt() },
      );
      return id;
    } catch (error) {
      if (error instanceof RefusedError && error.status === 404) {
        return undefined;
      }
      throw error;
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
