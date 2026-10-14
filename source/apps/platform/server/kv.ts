import * as Platform from "@ensemble/platform";
import type { Sealed, Vault } from "./vault.ts";

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

/**
 * Every manifest's environments, keyed under its project and manifest by
 * name: a name is unique within its manifest, and never changes.
 */
export class Environments {
  constructor(private readonly kv: Deno.Kv) {}

  /** Adds `environment` unless its manifest has one by that name; says whether it did. */
  async add(environment: Platform.Environment): Promise<boolean> {
    const key = this.keyOf(environment);
    const result = await this.kv.atomic()
      .check({ key, versionstamp: null })
      .set(key, this.recordOf(environment))
      .commit();
    return result.ok;
  }

  /** Gives each of `manifests` its first environment, unless it has one already. */
  async ensureFirst(
    project: string,
    manifests: readonly Platform.Manifest[],
  ): Promise<void> {
    for (const manifest of manifests) {
      const existing = this.kv.list({
        prefix: ["environments", project, manifest.name],
      }, { limit: 1 });
      if (!(await existing.next()).done) continue;
      await this.add(Platform.Environment.first(project, manifest.name));
    }
  }

  async get(
    project: string,
    manifest: string,
    name: string,
  ): Promise<Platform.Environment | undefined> {
    const { value } = await this.kv.get<EnvironmentRecord>([
      "environments",
      project,
      manifest,
      name,
    ]);
    return value ? Platform.Environment.restore(value) : undefined;
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

  private keyOf(environment: Platform.Environment): Deno.KvKey {
    return [
      "environments",
      environment.project,
      environment.manifest,
      environment.name,
    ];
  }

  private recordOf(environment: Platform.Environment): EnvironmentRecord {
    return {
      id: environment.id,
      project: environment.project,
      manifest: environment.manifest,
      name: environment.name,
    };
  }
}

interface EnvironmentRecord {
  readonly id: string;
  readonly project: string;
  readonly manifest: string;
  readonly name: string;
}

/**
 * What each environment supplies, by its id: variables as they are, secrets
 * sealed by the `Vault` to the environment and name they belong to.
 */
export class Values {
  constructor(private readonly kv: Deno.Kv, private readonly vault: Vault) {}

  async setVariable(
    environment: Platform.Environment,
    name: string,
    value: string,
  ): Promise<void> {
    await this.kv.set(["variables", environment.id, name], value);
  }

  async unsetVariable(
    environment: Platform.Environment,
    name: string,
  ): Promise<void> {
    await this.kv.delete(["variables", environment.id, name]);
  }

  async setSecret(
    environment: Platform.Environment,
    name: string,
    value: string,
  ): Promise<void> {
    await this.kv.set(
      ["secrets", environment.id, name],
      await this.vault.seal(value, [environment.id, name]),
    );
  }

  async unsetSecret(
    environment: Platform.Environment,
    name: string,
  ): Promise<void> {
    await this.kv.delete(["secrets", environment.id, name]);
  }

  /** What `environment` supplies, secrets by name only. */
  async of(environment: Platform.Environment): Promise<Platform.Values> {
    const variables = new Map<string, string>();
    for await (
      const entry of this.kv.list<string>({
        prefix: ["variables", environment.id],
      })
    ) {
      variables.set(String(entry.key[2]), entry.value);
    }
    const secrets = new Set<string>();
    for await (
      const entry of this.kv.list({ prefix: ["secrets", environment.id] })
    ) {
      secrets.add(String(entry.key[2]));
    }
    return new Platform.Values(variables, secrets);
  }

  /** A secret's value, opened: only for handing to a deploy, never to a screen. */
  async reveal(
    environment: Platform.Environment,
    name: string,
  ): Promise<string | undefined> {
    const { value } = await this.kv.get<Sealed>([
      "secrets",
      environment.id,
      name,
    ]);
    return value
      ? await this.vault.open(value, [environment.id, name])
      : undefined;
  }
}
