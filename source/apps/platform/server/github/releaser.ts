import type { Apps } from "./apps.ts";
import { NoAppError, type Tokens } from "./tokens.ts";

/**
 * Who a release of one repository commits, tags and pushes as — the app's
 * bot — and the token it pushes with: given to git as environment-supplied
 * configuration (`GIT_CONFIG_COUNT`), never written into the checkout, and to
 * `gh` as `GH_TOKEN`, for the GitHub release it publishes.
 */
export class Releaser {
  constructor(
    readonly name: string,
    readonly email: string,
    readonly token: string,
  ) {}

  /** What `ens release` runs with, beside the project's own credentials. */
  environment(): Record<string, string> {
    return {
      GIT_AUTHOR_NAME: this.name,
      GIT_AUTHOR_EMAIL: this.email,
      GIT_COMMITTER_NAME: this.name,
      GIT_COMMITTER_EMAIL: this.email,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${
        btoa(`x-access-token:${this.token}`)
      }`,
      GH_TOKEN: this.token,
    };
  }
}

/** The releaser for each repository: the app's bot, with a token for that repository's installation. */
export class Releasers {
  constructor(private readonly apps: Apps, private readonly tokens: Tokens) {}

  async of(repository: string): Promise<Releaser> {
    const app = await this.apps.get();
    if (!app) throw new NoAppError();
    const { name, email } = app.bot;
    return new Releaser(name, email, await this.tokens.for(repository));
  }
}
