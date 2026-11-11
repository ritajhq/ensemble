import { relative, SEPARATOR } from "@std/path";
import * as Platform from "@ensemble/platform";
import { Process } from "./process.ts";

/** Compose's own labels on every container it starts. */
const PROJECT = "com.docker.compose.project";
const SERVICE = "com.docker.compose.service";
const CONFIG_FILES = "com.docker.compose.project.config_files";

/** The hosts a container asks the local proxy (caddy-docker-proxy) to answer for it. */
const HOSTS = "caddy";

/** What `docker inspect` says of one container, as far as it is read here. */
interface Inspected {
  readonly Config: {
    readonly Image: string;
    readonly Labels: Readonly<Record<string, string>> | null;
  };
  readonly State: {
    readonly Status: string;
    readonly Health?: { readonly Status: string };
  };
}

/**
 * Every deployment `ens deploy` left running on the machine's Docker, from any
 * checkout: each compose project whose files `ens` rendered, with its
 * services, its hosts, and — when it was deployed from one of the platform's
 * own checkouts — its project.
 *
 * Compose only: it reads compose's labels, so stacks of other kits don't show.
 */
export class LiveDeployments {
  constructor(
    /** Where the platform checks projects out: `<workspace>/<project>`, and branch previews under `<workspace>/.previews/<project>/`. */
    private readonly workspace: string,
    private readonly docker: string = "docker",
  ) {}

  async list(): Promise<Platform.LiveDeployment[]> {
    const ids = (await new Process(this.docker, [
      "ps",
      "--all",
      "--quiet",
      "--filter",
      `label=${PROJECT}`,
    ]).run()).split("\n").map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) return [];

    const inspected: Inspected[] = JSON.parse(
      await new Process(this.docker, ["inspect", ...ids]).run(),
    );
    return this.grouped(inspected).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The containers as deployments: one per compose project `ens` rendered, the rest left out. */
  private grouped(
    containers: readonly Inspected[],
  ): Platform.LiveDeployment[] {
    const byProject = new Map<string, Inspected[]>();
    for (const container of containers) {
      const name = container.Config.Labels?.[PROJECT];
      if (!name) continue;
      byProject.set(name, [...byProject.get(name) ?? [], container]);
    }
    return [...byProject].flatMap(([name, members]) => {
      const scope = this.scopeOf(members);
      if (!scope) return [];
      return [
        new Platform.LiveDeployment(
          name,
          scope,
          members.map((member) => this.serviceOf(member))
            .sort((a, b) => a.name.localeCompare(b.name)),
          [...new Set(members.flatMap((member) => this.hostsOf(member)))],
          this.projectOf(scope.checkout),
        ),
      ];
    });
  }

  private scopeOf(
    members: readonly Inspected[],
  ): Platform.DeploymentScope | undefined {
    for (const member of members) {
      const files = member.Config.Labels?.[CONFIG_FILES] ?? "";
      for (const file of files.split(",")) {
        const scope = Platform.DeploymentScope.ofArtifact(file.trim());
        if (scope) return scope;
      }
    }
    return undefined;
  }

  private serviceOf(container: Inspected): Platform.LiveService {
    const health = container.State.Health?.Status;
    return {
      name: container.Config.Labels?.[SERVICE] ?? "",
      state: container.State.Status,
      ...(health ? { health } : {}),
      image: container.Config.Image,
    };
  }

  private hostsOf(container: Inspected): string[] {
    const hosts = container.Config.Labels?.[HOSTS] ?? "";
    return hosts.split(",").map((host) => host.trim()).filter(Boolean);
  }

  /** The project whose checkout — or branch preview's checkout — `checkout` is; none outside the platform's workspace. */
  private projectOf(checkout: string): string | undefined {
    const inside = relative(this.workspace, checkout).split(SEPARATOR);
    if (inside[0] === "" || inside[0] === "..") return undefined;
    return inside[0] === ".previews" ? inside[1] : inside[0];
  }
}
