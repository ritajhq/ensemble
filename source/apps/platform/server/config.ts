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
  /** What the platform answers for itself — host → where the router reaches it: its UI's guard, its sign-in — before any deployment. */
  readonly own: readonly { readonly host: string; readonly upstream: URL }[];
  /** The guard previews are reached through; none, and no preview can be reached. */
  readonly previewGuard?: URL;
  /** The platform's own session cookie, kept from every deployment. */
  readonly sessionCookie?: string;
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
    const previewGuard = this.env.get("PLATFORM_PREVIEW_GUARD");
    const sessionCookie = this.env.get("PLATFORM_SESSION_COOKIE");
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
      own: this.ownRoutes(this.env.get("PLATFORM_ROUTES") ?? ""),
      ...(previewGuard ? { previewGuard: new URL(previewGuard) } : {}),
      ...(sessionCookie ? { sessionCookie } : {}),
    };
  }

  /** `host=url` pairs, comma-separated: `platform.ensemble.blue=http://guard:8080,auth.ensemble.blue=http://auth:4100`. */
  private ownRoutes(
    spec: string,
  ): { host: string; upstream: URL }[] {
    return spec.split(",").map((pair) => pair.trim()).filter(Boolean).map(
      (pair) => {
        const at = pair.indexOf("=");
        if (at < 1) {
          throw new MissingConfigurationError(
            `PLATFORM_ROUTES names "${pair}": write each as host=url.`,
          );
        }
        return {
          host: pair.slice(0, at).trim(),
          upstream: new URL(pair.slice(at + 1).trim()),
        };
      },
    );
  }
}
