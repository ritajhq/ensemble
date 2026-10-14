import { join } from "@std/path";
import { $ } from "@david/dax";

const DOCKER_HUB = "docker.io";

/**
 * Where an image reference lives once docker has normalized it: the
 * registry it's pushed to and the repository inside it. Mirrors docker's own
 * rule — the first path component is a registry only when it looks like a
 * host (has a "." or ":", or is "localhost"); otherwise the reference is a
 * Docker Hub one, with single-component names under `library/`.
 */
export class ImageReference {
  private constructor(
    readonly registry: string,
    readonly repository: string,
  ) {}

  static parse(reference: string): ImageReference {
    const withoutDigest = reference.split("@")[0];
    const lastSlash = withoutDigest.lastIndexOf("/");
    const lastColon = withoutDigest.lastIndexOf(":");
    const name = lastColon > lastSlash
      ? withoutDigest.slice(0, lastColon)
      : withoutDigest;

    const [first, ...rest] = name.split("/");
    const isHost = rest.length > 0 &&
      (first.includes(".") || first.includes(":") || first === "localhost");
    if (isHost) return new ImageReference(first, rest.join("/"));
    if (rest.length === 0) {
      return new ImageReference(DOCKER_HUB, `library/${first}`);
    }
    return new ImageReference(DOCKER_HUB, name);
  }

  /** The host the registry's HTTP API answers on — Docker Hub's differs from its reference name. */
  get apiHost(): string {
    return this.registry === DOCKER_HUB
      ? "registry-1.docker.io"
      : this.registry;
  }

  /** The key docker files this registry's credentials under. */
  get credentialsKey(): string {
    return this.registry === DOCKER_HUB
      ? "https://index.docker.io/v1/"
      : this.registry;
  }

  /** Plain HTTP for loopback registries, as docker itself allows; HTTPS everywhere else. */
  get baseUrl(): string {
    const host = this.apiHost.replace(/:\d+$/, "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(host);
    return `${loopback ? "http" : "https"}://${this.apiHost}`;
  }
}

export interface Credentials {
  readonly username: string;
  readonly secret: string;
}

/** Runs `docker-credential-<helper> get` for a registry key, the way docker resolves a credential helper. Undefined when the helper has nothing stored. */
export type CredentialHelper = (
  helper: string,
  key: string,
) => Promise<Credentials | undefined>;

async function runCredentialHelper(
  helper: string,
  key: string,
): Promise<Credentials | undefined> {
  const result = await $`docker-credential-${helper} get`
    .stdinText(key)
    .stdout("piped")
    .stderr("piped")
    .noThrow();
  if (result.code !== 0) return undefined;
  const { Username, Secret } = JSON.parse(result.stdout) as {
    Username: string;
    Secret: string;
  };
  return { username: Username, secret: Secret };
}

interface DockerConfig {
  auths?: Record<string, { auth?: string }>;
  credHelpers?: Record<string, string>;
  credsStore?: string;
}

/**
 * The credentials docker itself would push with, read from the same
 * `config.json` (`$DOCKER_CONFIG`, else `~/.docker`) in the same order:
 * a registry-specific credential helper, then an inline `auths` entry, then
 * the default credential store.
 */
export class DockerCredentials {
  constructor(
    private readonly config: DockerConfig,
    private readonly helper: CredentialHelper = runCredentialHelper,
  ) {}

  static async load(): Promise<DockerCredentials> {
    const dir = Deno.env.get("DOCKER_CONFIG") ??
      join(Deno.env.get("HOME") ?? "", ".docker");
    try {
      return new DockerCredentials(
        JSON.parse(await Deno.readTextFile(join(dir, "config.json"))),
      );
    } catch {
      return new DockerCredentials({});
    }
  }

  async for(image: ImageReference): Promise<Credentials | undefined> {
    const key = image.credentialsKey;
    const helper = this.config.credHelpers?.[image.registry] ??
      this.config.credHelpers?.[key];
    if (helper) return await this.helper(helper, key);

    const inline = Object.entries(this.config.auths ?? {}).find(([entry]) =>
      sameRegistry(entry, key)
    )?.[1].auth;
    if (inline) {
      const decoded = atob(inline);
      const separator = decoded.indexOf(":");
      return {
        username: decoded.slice(0, separator),
        secret: decoded.slice(separator + 1),
      };
    }

    if (this.config.credsStore) {
      return await this.helper(this.config.credsStore, key);
    }
    return undefined;
  }
}

/** `auths` keys may carry a scheme or path (`https://ghcr.io`, `https://index.docker.io/v1/`) — compare by host. */
function sameRegistry(entry: string, key: string): boolean {
  const host = (value: string) =>
    value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return host(entry) === host(key);
}

/** The slice of `fetch` the probe needs — its own seam so a test can answer for the registry instead of reaching it. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Proves push access to a repository by doing the first step of an actual
 * push — opening a blob upload session (`POST /v2/<name>/blobs/uploads/`),
 * which every registry only grants to a writer — then cancelling it straight
 * away, so nothing is uploaded and nothing outlives the check. Follows the
 * registry's auth challenge the way docker does: a Bearer challenge is
 * answered with a token requested for `push,pull` on the repository, a Basic
 * one with the credentials directly.
 */
export class RegistryPushProbe {
  constructor(private readonly fetch: Fetch = globalThis.fetch) {}

  async require(
    image: ImageReference,
    credentials: Credentials | undefined,
  ): Promise<void> {
    const uploads = `${image.baseUrl}/v2/${image.repository}/blobs/uploads/`;
    const anonymous = await this.fetch(uploads, { method: "POST" });
    if (anonymous.status !== 401) {
      return await this.conclude(anonymous, image, credentials, undefined);
    }

    const challenge = anonymous.headers.get("www-authenticate") ?? "";
    await anonymous.body?.cancel();
    const authorization = await this.answer(challenge, image, credentials);
    const authenticated = await this.fetch(uploads, {
      method: "POST",
      headers: { Authorization: authorization },
    });
    await this.conclude(authenticated, image, credentials, authorization);
  }

  /** A 202 means the registry opened an upload session for us — push access proven; anything else is its refusal. */
  private async conclude(
    response: Response,
    image: ImageReference,
    credentials: Credentials | undefined,
    authorization: string | undefined,
  ): Promise<void> {
    if (response.status === 202) {
      await this.cancel(response, image, authorization);
      return;
    }

    const detail = await response.text().catch(() => "");
    const hint = credentials
      ? ""
      : ` (docker has no credentials for ${image.registry} — run "docker login ${image.registry}")`;
    throw new Error(
      `${image.registry} refused a push to ${image.repository}: HTTP ${response.status}${
        detail ? ` ${detail.trim()}` : ""
      }${hint}`,
    );
  }

  private async answer(
    challenge: string,
    image: ImageReference,
    credentials: Credentials | undefined,
  ): Promise<string> {
    const basic = credentials
      ? `Basic ${btoa(`${credentials.username}:${credentials.secret}`)}`
      : undefined;
    const [scheme] = challenge.split(" ", 1);
    if (scheme.toLowerCase() !== "bearer") {
      if (basic) return basic;
      throw new Error(
        `${image.registry} requires credentials and docker has none for it — run "docker login ${image.registry}".`,
      );
    }

    const params = Object.fromEntries(
      [...challenge.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]),
    );
    const tokenUrl = new URL(params.realm);
    if (params.service) tokenUrl.searchParams.set("service", params.service);
    tokenUrl.searchParams.set(
      "scope",
      `repository:${image.repository}:push,pull`,
    );
    const response = await this.fetch(tokenUrl.toString(), {
      headers: basic ? { Authorization: basic } : {},
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `${image.registry} rejected docker's credentials: HTTP ${response.status}${
          detail ? ` ${detail.trim()}` : ""
        }`,
      );
    }
    const { token, access_token } = await response.json() as {
      token?: string;
      access_token?: string;
    };
    return `Bearer ${token ?? access_token}`;
  }

  private async cancel(
    response: Response,
    image: ImageReference,
    authorization: string | undefined,
  ): Promise<void> {
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) return;
    const cancelled = await this.fetch(
      new URL(location, image.baseUrl).toString(),
      {
        method: "DELETE",
        headers: authorization ? { Authorization: authorization } : {},
      },
    ).catch(() => undefined);
    await cancelled?.body?.cancel();
  }
}
