import * as Platform from "@ensemble/platform";

/** Every project added, by id. */
export class Projects {
  constructor(private readonly kv: Deno.Kv) {}

  /** Adds `project` unless one with its id exists already; says whether it did. */
  async add(project: Platform.Project): Promise<boolean> {
    const key = ["projects", project.id];
    const result = await this.kv.atomic()
      .check({ key, versionstamp: null })
      .set(key, {
        id: project.id,
        repository: project.repository,
        ref: project.ref,
      })
      .commit();
    return result.ok;
  }

  async get(id: string): Promise<Platform.Project | undefined> {
    const entry = await this.kv.get<ProjectRecord>(["projects", id]);
    return entry.value ? Platform.Project.create(entry.value) : undefined;
  }

  async list(): Promise<Platform.Project[]> {
    const projects: Platform.Project[] = [];
    for await (
      const entry of this.kv.list<ProjectRecord>({ prefix: ["projects"] })
    ) {
      projects.push(Platform.Project.create(entry.value));
    }
    return projects;
  }
}

interface ProjectRecord {
  readonly id: string;
  readonly repository: string;
  readonly ref: string;
}

/** What each project's checkout offered at its last successful sync. */
export class Catalogs {
  constructor(private readonly kv: Deno.Kv) {}

  async save(project: string, catalog: Platform.Catalog): Promise<void> {
    const record: CatalogRecord = {
      commit: catalog.commit,
      manifests: catalog.manifests.map((manifest) => ({
        name: manifest.name,
        ships: [...manifest.ships],
        variables: [...manifest.variables],
        secrets: [...manifest.secrets],
      })),
      problems: [...catalog.problems],
      kits: [...catalog.kits],
    };
    await this.kv.set(["catalogs", project], record);
  }

  async of(project: string): Promise<Platform.Catalog | undefined> {
    const { value } = await this.kv.get<CatalogRecord>(["catalogs", project]);
    if (!value) return undefined;
    return new Platform.Catalog(
      value.commit,
      value.manifests.map((manifest) =>
        new Platform.Manifest(
          manifest.name,
          manifest.ships,
          manifest.variables,
          manifest.secrets,
        )
      ),
      value.problems,
      value.kits,
    );
  }
}

interface CatalogRecord {
  readonly commit: string;
  readonly manifests: readonly {
    readonly name: string;
    readonly ships: readonly string[];
    readonly variables: readonly Platform.DeclaredVariable[];
    readonly secrets: readonly string[];
  }[];
  readonly problems: readonly Platform.Problem[];
  readonly kits: readonly string[];
}

/** How a project's latest sync went. */
export interface Sync {
  readonly state: "syncing" | "synced" | "failed";
  readonly at: string;
  readonly commit?: string;
  readonly error?: string;
}

/** Each project's latest sync. */
export class Syncs {
  constructor(private readonly kv: Deno.Kv) {}

  async record(project: string, sync: Sync): Promise<void> {
    await this.kv.set(["syncs", project], sync);
  }

  async of(project: string): Promise<Sync | undefined> {
    return (await this.kv.get<Sync>(["syncs", project])).value ?? undefined;
  }
}

/** Every manifest's environments, keyed under its project and manifest. */
export class Environments {
  constructor(private readonly kv: Deno.Kv) {}

  /** Gives each of `manifests` its first environment, unless it has one already. */
  async ensureFirst(
    project: string,
    manifests: readonly Platform.Manifest[],
  ): Promise<void> {
    for (const manifest of manifests) {
      const prefix = ["environments", project, manifest.name];
      const existing = this.kv.list({ prefix }, { limit: 1 });
      if (!(await existing.next()).done) continue;

      const first = Platform.Environment.first(project, manifest.name);
      await this.kv.set([...prefix, first.id], {
        id: first.id,
        project: first.project,
        manifest: first.manifest,
        name: first.name,
      });
    }
  }

  async of(project: string): Promise<Platform.Environment[]> {
    const environments: Platform.Environment[] = [];
    const entries = this.kv.list<EnvironmentRecord>({
      prefix: ["environments", project],
    });
    for await (const entry of entries) {
      environments.push(Platform.Environment.restore(entry.value));
    }
    return environments;
  }
}

interface EnvironmentRecord {
  readonly id: string;
  readonly project: string;
  readonly manifest: string;
  readonly name: string;
}
