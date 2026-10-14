/** Where a host's requests go: a deployment's gateway, by the alias it answers to on the ingress network. */
export interface Upstream {
  readonly alias: string;
  readonly port: number;
  readonly scheme: "http" | "https";
}

/** One host, the deployment answering for it, and where that deployment is reached. */
export interface Route {
  readonly host: string;
  /** `<project>/<manifest>/<environment>`. */
  readonly owner: string;
  readonly upstream: Upstream;
}

/** A host two deployments answer for: it goes to the first, by owner, until the others stop claiming it. */
export interface Conflict {
  readonly host: string;
  readonly owners: readonly string[];
}

/** A host or alias a router can't be given safely, and whose it was. */
export interface Rejection {
  readonly owner: string;
  readonly value: string;
}

/** What one deployment records about where it answers (`ens`'s ingress record, alias named). */
export interface Ingresses {
  readonly owner: string;
  readonly ingresses: readonly {
    readonly alias: string;
    readonly port: number;
    readonly scheme: "http" | "https";
    readonly hosts: readonly string[];
  }[];
}

/** A host name, possibly a leading wildcard: nothing that could be read as anything else in a router's configuration. */
const HOST =
  /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** A network alias, as docker allows it. */
const ALIAS = /^[a-z0-9][a-z0-9_.-]*$/;

/**
 * Which deployment answers for each host, built from what each deployment
 * recorded about its own ingresses: what the platform's router routes by.
 * A route with no host (a gateway's catch-all) is left out: on a router
 * shared by many deployments, it has nothing to be told apart by.
 */
export class RoutingTable {
  private constructor(
    readonly routes: readonly Route[],
    readonly conflicts: readonly Conflict[],
    readonly rejections: readonly Rejection[],
  ) {}

  /**
   * `reserved` answers first, whatever its owner: what the platform answers
   * for itself, so no deployment can claim a host from under it.
   */
  static of(
    deployments: readonly Ingresses[],
    reserved: readonly Ingresses[] = [],
  ): RoutingTable {
    const claims = new Map<string, Route[]>();
    const rejections: Rejection[] = [];

    const ordered = [
      ...reserved,
      ...[...deployments].sort((a, b) => a.owner.localeCompare(b.owner)),
    ];
    for (const { owner, ingresses } of ordered) {
      for (const ingress of ingresses) {
        if (!ALIAS.test(ingress.alias)) {
          rejections.push({ owner, value: ingress.alias });
          continue;
        }
        if (
          !Number.isInteger(ingress.port) || ingress.port < 1 ||
          ingress.port > 65535
        ) {
          rejections.push({ owner, value: String(ingress.port) });
          continue;
        }
        for (const host of ingress.hosts) {
          if (host === "") continue;
          const name = host.toLowerCase();
          if (!HOST.test(name)) {
            rejections.push({ owner, value: host });
            continue;
          }
          const route = {
            host: name,
            owner,
            upstream: {
              alias: ingress.alias,
              port: ingress.port,
              scheme: ingress.scheme,
            },
          };
          claims.set(name, [...claims.get(name) ?? [], route]);
        }
      }
    }

    const routes = [...claims.values()].map(([first]) => first);
    const conflicts = [...claims.entries()]
      .filter(([, claimed]) => new Set(claimed.map((r) => r.owner)).size > 1)
      .map(([host, claimed]) => ({
        host,
        owners: [...new Set(claimed.map((route) => route.owner))],
      }));
    return new RoutingTable(
      routes.sort((a, b) => a.host.localeCompare(b.host)),
      conflicts,
      rejections,
    );
  }
}
