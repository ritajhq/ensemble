import { relative, SEPARATOR } from "@std/path";
import * as Platform from "@ensemble/platform";
import type * as Kv from "./kv.ts";
import { Process } from "./process.ts";

/** Compose's own labels on every container it starts. */
const PROJECT = "com.docker.compose.project";
const SERVICE = "com.docker.compose.service";
const CONFIG_FILES = "com.docker.compose.project.config_files";

/** The hosts a container asks the local proxy (caddy-docker-proxy) to answer for it. */
const HOSTS = "caddy";

/** A deployment as Docker tells it, before its checkout is traced to a repository. */
interface Unclaimed {
  readonly name: string;
  readonly scope: Platform.DeploymentScope;
  readonly services: Platform.LiveService[];
  readonly hosts: string[];
}

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
 * services, its hosts, the GitHub repository its checkout was cloned from and
 * the project that repository is, whichever checkout on the machine it was
 * deployed from.
 *
 * Compose only: it reads compose's labels, so stacks of other kits don't show.
 */
export class LiveDeployments {
  constructor(
    private readonly projects: Kv.Projects,
    /** Where the platform checks projects out: `<workspace>/<project>`, and branch previews under `<workspace>/.previews/<project>/`. */
    private readonly workspace: string,
    private readonly docker: string = "docker",
    private readonly git: string = "git",
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
    return (await this.claimed(this.grouped(inspected)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Each deployment with the repository its checkout came from and the project that repository is. */
  private async claimed(
    deployments: readonly Unclaimed[],
  ): Promise<Platform.LiveDeployment[]> {
    const projects = await this.projects.list();
    const checkouts = [
      ...new Set(deployments.map(({ scope }) => scope.checkout)),
    ];
    const repositories = new Map(
      await Promise.all(
        checkouts.map(async (checkout) =>
          [checkout, await this.repositoryOf(checkout)] as const
        ),
      ),
    );
    return deployments.map(({ name, scope, services, hosts }) => {
      const repository = repositories.get(scope.checkout);
      const wanted = repository?.toLowerCase();
      const project = projects.find((candidate) =>
        candidate.repository.toLowerCase() === wanted
      )?.id ?? this.projectOf(scope.checkout);
      return new Platform.LiveDeployment(
        name,
        scope,
        services,
        hosts,
        repository,
        project,
      );
    });
  }

  /** The GitHub repository `checkout`'s origin points at; none when it is gone, isn't git, or points elsewhere. */
  private async repositoryOf(checkout: string): Promise<string | undefined> {
    try {
      const url = await new Process(this.git, [
        "-C",
        checkout,
        "remote",
        "get-url",
        "origin",
      ]).run();
      return Platform.Remote.ofUrl(url)?.repository;
    } catch {
      return undefined;
    }
  }

  /** The containers as deployments: one per compose project `ens` rendered, the rest left out. */
  private grouped(containers: readonly Inspected[]): Unclaimed[] {
    const byProject = new Map<string, Inspected[]>();
    for (const container of containers) {
      const name = container.Config.Labels?.[PROJECT];
      if (!name) continue;
      byProject.set(name, [...byProject.get(name) ?? [], container]);
    }
    return [...byProject].flatMap(([name, members]) => {
      const scope = this.scopeOf(members);
      if (!scope) return [];
      return [{
        name,
        scope,
        services: members.map((member) => this.serviceOf(member))
          .sort((a, b) => a.name.localeCompare(b.name)),
        hosts: [...new Set(members.flatMap((member) => this.hostsOf(member)))],
      }];
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

  /** The project whose checkout — or branch preview's checkout — `checkout` is, for one whose origin can't be read any more; none outside the platform's workspace. */
  private projectOf(checkout: string): string | undefined {
    const inside = relative(this.workspace, checkout).split(SEPARATOR);
    if (inside[0] === "" || inside[0] === "..") return undefined;
    return inside[0] === ".previews" ? inside[1] : inside[0];
  }
}
