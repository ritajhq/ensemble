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
        deployable: manifest.deployable,
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
          manifest.deployable,
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
    readonly deployable: boolean;
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

/** The longest a kept log line gets; anything past it is cut. */
const MAX_LINE = 8_000;

/**
 * Every run, the order each project's were queued in, and what each printed.
 * One run's writes land in the order they were asked for, so its final state
 * is never overwritten by an earlier one, and follows every line it printed.
 */
export class Runs {
  private readonly writes = new Map<string, Promise<unknown>>();

  constructor(private readonly kv: Deno.Kv) {}

  save(run: Platform.Run): Promise<void> {
    return this.inOrder(run.id, async () => {
      await this.kv.atomic()
        .set(["runs", run.id], this.recordOf(run))
        .set(
          ["project-runs", run.work.project, run.queuedAt, run.id],
          run.id,
        )
        .commit();
    });
  }

  async get(id: string): Promise<Platform.Run | undefined> {
    const { value } = await this.kv.get<RunRecord>(["runs", id]);
    return value ? this.restore(value) : undefined;
  }

  /** A project's runs, newest first. */
  async of(project: string, limit = 50): Promise<Platform.Run[]> {
    const runs: Platform.Run[] = [];
    const ids = this.kv.list<string>(
      { prefix: ["project-runs", project] },
      { reverse: true, limit },
    );
    for await (const entry of ids) {
      const run = await this.get(entry.value);
      if (run) runs.push(run);
    }
    return runs;
  }

  addLine(run: string, index: number, line: string): Promise<void> {
    return this.inOrder(run, async () => {
      await this.kv.set(["run-lines", run, index], line.slice(0, MAX_LINE));
    });
  }

  /** What `run` printed, from line `from` on. */
  async lines(run: string, from = 0): Promise<string[]> {
    const lines: string[] = [];
    const entries = this.kv.list<string>({
      start: ["run-lines", run, from],
      end: ["run-lines", run, Number.MAX_SAFE_INTEGER],
    });
    for await (const entry of entries) lines.push(entry.value);
    return lines;
  }

  private inOrder(run: string, write: () => Promise<void>): Promise<void> {
    const previous = this.writes.get(run) ?? Promise.resolve();
    const next = previous.then(write, write);
    this.writes.set(run, next);
    const forget = () => {
      if (this.writes.get(run) === next) this.writes.delete(run);
    };
    next.then(forget, forget);
    return next;
  }

  private recordOf(run: Platform.Run): RunRecord {
    return {
      id: run.id,
      state: run.state,
      queuedAt: run.queuedAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      commit: run.commit,
      error: run.error,
      work: { ...run.work },
    };
  }

  private restore(record: RunRecord): Platform.Run {
    return Platform.Run.restore({
      ...record,
      work: WORKS[record.work.kind](record.work),
    });
  }
}

/** How each kind of work is read back from what was stored. */
const WORKS: Readonly<
  Record<string, (record: Record<string, string>) => Platform.Work>
> = {
  deploy: (record) =>
    Platform.Deployment.create({
      project: record.project,
      manifest: record.manifest,
      environment: record.environment,
      kit: record.kit,
      version: record.version,
      termination: record.termination,
    }),
  release: (record) =>
    Platform.Release.create({
      project: record.project,
      action: record.action,
      argument: record.argument,
    }),
};

interface RunRecord {
  readonly id: string;
  readonly state: Platform.RunState;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly commit?: string;
  readonly error?: string;
  readonly work: Record<string, string> & { readonly kind: string };
}

/** An environment variable's name, as a release credential is handed to `ens` under it. */
const CREDENTIAL = /^[A-Z_][A-Z0-9_]*$/;

/** Thrown when a release credential would get a name no environment variable can have. */
export class InvalidCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCredentialError";
  }
}

/**
 * What each project's releases publish with — registry passwords,
 * `JSR_TOKEN`, `VSCE_PAT`, `GH_TOKEN` — sealed by the `Vault`, and handed to
 * `ens release` as environment variables of the same names. Their values
 * never come back out but for that.
 */
export class Credentials {
  constructor(private readonly kv: Deno.Kv, private readonly vault: Vault) {}

  async set(project: string, name: string, value: string): Promise<void> {
    if (!CREDENTIAL.test(name)) {
      throw new InvalidCredentialError(
        `"${name}" isn't an environment variable name: use capitals, digits and underscores.`,
      );
    }
    await this.kv.set(
      ["credentials", project, name],
      await this.vault.seal(value, [project, "credentials", name]),
    );
  }

  async unset(project: string, name: string): Promise<void> {
    await this.kv.delete(["credentials", project, name]);
  }

  async names(project: string): Promise<string[]> {
    const names: string[] = [];
    for await (
      const entry of this.kv.list({ prefix: ["credentials", project] })
    ) {
      names.push(String(entry.key[2]));
    }
    return names;
  }

  /** Every credential, opened: only for handing to a release, never to a screen. */
  async reveal(project: string): Promise<Record<string, string>> {
    const opened: Record<string, string> = {};
    for await (
      const entry of this.kv.list<Sealed>({ prefix: ["credentials", project] })
    ) {
      const name = String(entry.key[2]);
      opened[name] = await this.vault.open(entry.value, [
        project,
        "credentials",
        name,
      ]);
    }
    return opened;
  }
}
