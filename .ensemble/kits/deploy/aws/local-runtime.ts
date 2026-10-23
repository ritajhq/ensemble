import { join } from "@std/path";
import { $ } from "@david/dax";

/**
 * The local AWS `ens develop` brings up when the environment points the `aws`
 * CLI at one (`AWS_ENDPOINT_URL` on this machine): MiniStack, plus what makes
 * it behave like the real thing for a stack.
 *
 * - MiniStack on the endpoint's port (plain HTTP, 4566 by default), naming
 *   itself `lvh.me`: every `*.lvh.me` resolves to 127.0.0.1 on this machine
 *   and inside the container, so the hostnames it hands out (an API's
 *   `<id>.execute-api.lvh.me`, a distribution's `<id>.cloudfront.lvh.me`) work
 *   from a browser and from CloudFront alike.
 * - The browser's way in, plain HTTP on `EDGE_PORT` (8080): no certificate to
 *   trust. The stack is the one real AWS gets, so CloudFront redirects viewers
 *   to HTTPS; this entrance tells MiniStack the request came over HTTPS
 *   (`X-Forwarded-Proto`), the way a TLS-terminating proxy would.
 * - HTTPS on 443 inside MiniStack's own network namespace only, terminated by
 *   Caddy with a certificate made here: CloudFront only talks HTTPS to an API
 *   Gateway origin, and that hop never leaves the container.
 * - The artifacts bucket function bundles are uploaded to.
 *
 * Which environment a stack lands in is still the environment's to say, never
 * the kit's: an endpoint that isn't on this machine (or none, the account the
 * `aws` CLI is configured for) is left alone.
 */
export class LocalRuntime {
  static readonly ENVIRONMENT_VARIABLE = "ENSEMBLE_START_RUNTIME";

  private static readonly IMAGE = "ministackorg/ministack:1.5";
  private static readonly PROXY_IMAGE = "caddy:2.11-alpine";
  private static readonly HOSTNAME_SUFFIX = "lvh.me";

  private constructor(
    private readonly apiPort: number,
    private readonly edgePort: number,
    private readonly name: string,
    private readonly artifactsBucket: string,
    private readonly stateDirectory: string,
  ) {}

  /** The runtime the environment's endpoint stands for; `undefined` when it points anywhere but this machine. */
  static of(environment: Deno.Env): LocalRuntime | undefined {
    const endpoint = environment.get("AWS_ENDPOINT_URL");
    if (endpoint === undefined) return undefined;
    const url = new URL(endpoint);
    const hostname = url.hostname;
    const local = hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname.endsWith(`.${LocalRuntime.HOSTNAME_SUFFIX}`);
    if (!local) return undefined;

    const name = environment.get("NAME") ?? "ens-ministack";
    const cache = environment.get("XDG_CACHE_HOME") ??
      join(environment.get("HOME") ?? ".", ".cache");
    return new LocalRuntime(
      Number(url.port || 80),
      Number(environment.get("EDGE_PORT") ?? 8080),
      name,
      environment.get("ENS_AWS_ARTIFACTS_BUCKET") ?? "ens-artifacts",
      join(cache, name),
    );
  }

  /** Whether `ens develop` was told (or defaulted) to bring the runtime up. */
  static get wanted(): boolean {
    return Deno.env.get(LocalRuntime.ENVIRONMENT_VARIABLE) === "true";
  }

  /** Starts MiniStack unless it is already running, and waits until it answers. Resolves to what to tell the developer. */
  async ensure(): Promise<string> {
    if (await this.running(this.name) && await this.running(this.tlsName)) {
      await this.waitUntilHealthy();
      return `MiniStack is running: http://localhost:${this.apiPort}`;
    }
    // Whatever is left of an earlier one — stopped by a restart of Docker —
    // holds no state worth keeping (MiniStack's is in memory), so it's
    // replaced rather than restarted.
    await this.remove();
    await this.writeCertificate();
    await $`docker run -d --name ${this.name} -p ${this.apiPort}:4566 -p ${this.edgePort}:8080 -e MINISTACK_HOST=${LocalRuntime.HOSTNAME_SUFFIX} -e SSL_CERT_FILE=/certs/cert.pem -v ${this.stateDirectory}:/certs:ro ${LocalRuntime.IMAGE}`
      .quiet();
    await $`docker run -d --name ${this.tlsName} --network container:${this.name} -v ${this.stateDirectory}:/certs:ro ${LocalRuntime.PROXY_IMAGE} caddy run --config /certs/Caddyfile --adapter caddyfile`
      .quiet();
    await this.waitUntilHealthy();
    await $`aws s3 mb s3://${this.artifactsBucket}`.quiet().noThrow();
    return `MiniStack is up: http://localhost:${this.apiPort} (AWS APIs), http://<id>.cloudfront.${LocalRuntime.HOSTNAME_SUFFIX}:${this.edgePort} (CloudFront).`;
  }

  private get tlsName(): string {
    return `${this.name}-tls`;
  }

  private async running(container: string): Promise<boolean> {
    const format = "{{.State.Running}}";
    const state = await $`docker inspect -f ${format} ${container}`
      .quiet().noThrow().text();
    return state.trim() === "true";
  }

  private async remove(): Promise<void> {
    await $`docker rm -f ${this.tlsName} ${this.name}`.quiet().noThrow();
  }

  /** A self-signed certificate for every hostname MiniStack hands out, made once, for the HTTPS hops inside the container; and Caddy's config for both listeners. */
  private async writeCertificate(): Promise<void> {
    await Deno.mkdir(this.stateDirectory, { recursive: true });
    const certificate = join(this.stateDirectory, "cert.pem");
    const key = join(this.stateDirectory, "key.pem");
    const suffix = LocalRuntime.HOSTNAME_SUFFIX;
    if (!(await this.exists(certificate))) {
      const names = [
        "DNS:localhost",
        `DNS:${suffix}`,
        `DNS:*.${suffix}`,
        `DNS:*.execute-api.${suffix}`,
        `DNS:*.cloudfront.${suffix}`,
        "IP:127.0.0.1",
      ].join(",");
      await $`openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout ${key} -out ${certificate} -subj /CN=ens-ministack -addext subjectAltName=${names} -addext basicConstraints=critical,CA:FALSE -addext extendedKeyUsage=serverAuth`
        .quiet();
      await Deno.chmod(certificate, 0o644);
      await Deno.chmod(key, 0o644);
    }
    await Deno.writeTextFile(
      join(this.stateDirectory, "Caddyfile"),
      `{
	auto_https off
	admin off
}
http://:8080 {
	reverse_proxy 127.0.0.1:4566 {
		header_up X-Forwarded-Proto https
	}
}
https:// {
	tls /certs/cert.pem /certs/key.pem
	reverse_proxy 127.0.0.1:4566
}
`,
    );
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await Deno.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private async waitUntilHealthy(): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(
          `http://localhost:${this.apiPort}/_ministack/health`,
          { signal: AbortSignal.timeout(2000) },
        );
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // Not up yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(
      `MiniStack didn't become healthy — see \`docker logs ${this.name}\`.`,
    );
  }
}
