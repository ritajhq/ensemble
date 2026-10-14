/** What the platform is configured with, read from its environment. */
export interface Configuration {
  readonly port: number;
  /** Where projects are checked out, one directory per project. */
  readonly workspace: string;
  /** The Deno KV file projects, catalogs and environments are kept in. */
  readonly database: string;
  /** The built web app's directory. */
  readonly web: string;
  /** Lets private repositories be cloned. */
  readonly githubToken?: string;
}

/** Reads the `Configuration` from environment variables, with defaults that suit a local run. */
export class ConfigurationLoader {
  constructor(
    private readonly env: Deno.Env,
    /** Where `ens build platform/web` writes, relative to this module. */
    private readonly defaultWeb: string,
  ) {}

  load(): Configuration {
    const githubToken = this.env.get("GITHUB_TOKEN");
    return {
      port: Number(this.env.get("PORT") ?? 8090),
      workspace: this.env.get("PLATFORM_WORKSPACE") ?? "/var/lib/ens-platform",
      database: this.env.get("PLATFORM_DATABASE") ??
        "/var/lib/ens-platform/platform.kv",
      web: this.env.get("PLATFORM_WEB") ?? this.defaultWeb,
      ...(githubToken ? { githubToken } : {}),
    };
  }
}
