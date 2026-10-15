/** What the platform is configured with, read from its environment. */
export interface Configuration {
  readonly port: number;
  /** Where projects are checked out, one directory per project. */
  readonly workspace: string;
  /** The Deno KV file projects, catalogs and environments are kept in. */
  readonly database: string;
  /** The built web app's directory. */
  readonly web: string;
  /** The Caddyfile the router reads: in a volume the router alone shares with the platform. */
  readonly routerConfiguration: string;
  /** The public domain previews answer under: each preview host is one label beneath it. */
  readonly previewDomain: string;
  /** The host the platform's own UI answers on, and where the router reaches it (`http://platform:8090`, or a guard in front of it). None: the router routes deployments only. */
  readonly own?: { readonly host: string; readonly upstream: URL };
  /** The `ens` binary deploys and releases run. */
  readonly ens: string;
  /** Who a release's commits and tags are made as. */
  readonly releaser: { readonly name: string; readonly email: string };
  /** Seals the secrets environments hold (see `Vault`). */
  readonly secretKey: string;
  /** Lets private repositories be cloned, and releases push their commits and tags. */
  readonly githubToken?: string;
}

/** Thrown when a value the platform can't start without is missing. */
export class MissingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingConfigurationError";
  }
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
    const host = this.env.get("PLATFORM_HOST");
    const secretKey = this.env.get("PLATFORM_SECRET_KEY");
    if (!secretKey) {
      throw new MissingConfigurationError(
        "PLATFORM_SECRET_KEY is not set: give the platform a key to seal secrets with (openssl rand -base64 32), and keep it — secrets sealed with one can't be opened with another.",
      );
    }
    return {
      port: Number(this.env.get("PORT") ?? 8090),
      workspace: this.env.get("PLATFORM_WORKSPACE") ?? "/var/lib/ens-platform",
      database: this.env.get("PLATFORM_DATABASE") ??
        "/var/lib/ens-platform/platform.kv",
      web: this.env.get("PLATFORM_WEB") ?? this.defaultWeb,
      previewDomain: this.env.get("PLATFORM_PREVIEW_DOMAIN") ??
        "ensemble.blue",
      routerConfiguration: this.env.get("PLATFORM_ROUTER_CONFIG") ??
        "/var/lib/ens-platform/router/Caddyfile",
      ens: this.env.get("ENS_BIN") ?? "ens",
      releaser: {
        name: this.env.get("PLATFORM_GIT_NAME") ?? "ensemble platform",
        email: this.env.get("PLATFORM_GIT_EMAIL") ??
          "platform@ensemble.invalid",
      },
      secretKey,
      ...(githubToken ? { githubToken } : {}),
      ...(host
        ? {
          own: {
            host,
            upstream: new URL(
              this.env.get("PLATFORM_UPSTREAM") ?? "http://platform:8090",
            ),
          },
        }
        : {}),
    };
  }
}
