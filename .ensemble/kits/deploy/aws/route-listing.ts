import type { RoutedTarget } from "./routes-metadata.ts";

/**
 * Where the environment serves CloudFront, when its distributions answer
 * somewhere other than `https://<id>.cloudfront.net` — a local stand-in that
 * reports real-AWS names but serves them under its own host, scheme and port
 * (`http://cloudfront.lvh.me:8080` for this repo's MiniStack): each
 * distribution is then listed as `<scheme>://<id>.<host>[:<port>]`. Part of
 * the environment, like `AWS_ENDPOINT_URL`; unset on AWS.
 */
export const CLOUDFRONT_URL = "ENS_AWS_CLOUDFRONT_URL";

/** One gateway as deployed: its routes and the address its stack reports. */
export interface DeployedGateway {
  readonly url: string;
  readonly targets: readonly RoutedTarget[];
}

/**
 * The `Routes:` listing `ens develop` shows for a compose stack, for a
 * deployed aws stack: each route target, the URL that reaches it, and its
 * paths — at the environment's own CloudFront address when it names one.
 */
export class RouteListing {
  constructor(private readonly cloudfrontUrl: string | undefined) {}

  lines(gateways: readonly DeployedGateway[]): string[] {
    const rows = gateways.flatMap((gateway) =>
      gateway.targets.map((target) => ({
        service: target.service,
        url: this.reachable(gateway.url),
        paths: target.paths.join(" "),
      }))
    );
    if (rows.length === 0) return [];
    const serviceWidth = Math.max(...rows.map((row) => row.service.length));
    const urlWidth = Math.max(...rows.map((row) => row.url.length));
    return [
      "Routes:",
      ...rows.map((row) =>
        `  ${row.service.padEnd(serviceWidth)}  ${
          row.url.padEnd(urlWidth)
        }  ${row.paths}`
      ),
    ];
  }

  private reachable(url: string): string {
    if (!this.cloudfrontUrl) return url;
    const deployed = new URL(url);
    const label = deployed.hostname.replace(/\.cloudfront\.net$/, "");
    if (label === deployed.hostname) return url;
    const served = new URL(this.cloudfrontUrl);
    served.hostname = `${label}.${served.hostname}`;
    served.pathname = deployed.pathname;
    return served.href.replace(/\/$/, "");
  }
}
