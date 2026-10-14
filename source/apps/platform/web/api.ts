/** How a project's latest sync went. */
export interface Sync {
  readonly state: "syncing" | "synced" | "failed";
  readonly at: string;
  readonly commit?: string;
  readonly error?: string;
}

export interface ProjectSummary {
  readonly id: string;
  readonly repository: string;
  readonly ref: string;
  readonly sync?: Sync;
}

export interface Variable {
  readonly name: string;
  readonly list: boolean;
  readonly default?: string;
}

/** One environment of a manifest: its variables' values, which secrets it holds (never their values), and what it still lacks. */
export interface Environment {
  readonly id: string;
  readonly name: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly secrets: readonly string[];
  readonly missing: readonly string[];
}

export interface Manifest {
  readonly name: string;
  readonly ships: readonly string[];
  readonly variables: readonly Variable[];
  readonly secrets: readonly string[];
  /** Whether it declares anything to deploy: a manifest may only release. */
  readonly deployable: boolean;
  readonly environments: readonly Environment[];
}

/** Which kind of value an environment supplies. */
export type ValueKind = "variables" | "secrets";

/** Where one environment is, for the calls that change it. */
export interface EnvironmentPath {
  readonly project: string;
  readonly manifest: string;
  readonly environment: string;
}

export interface Project extends ProjectSummary {
  /** The names of its release credentials; their values never come back. */
  readonly credentials: readonly string[];
  readonly catalog?: {
    readonly commit: string;
    readonly kits: readonly string[];
    readonly problems: readonly { manifest: string; message: string }[];
    readonly manifests: readonly Manifest[];
  };
}

export type Termination = "plan" | "apply";
export type RunState = "queued" | "running" | "succeeded" | "failed";

/** A deployment of one environment, as a run carries it out. */
export interface DeployWork {
  readonly kind: "deploy";
  readonly project: string;
  readonly manifest: string;
  readonly environment: string;
  readonly kit: string;
  readonly version: string;
  readonly termination: Termination;
}

export type ReleaseAction = "next" | "set" | "resume";

/** A release of a whole project, as a run carries it out. */
export interface ReleaseWork {
  readonly kind: "release";
  readonly project: string;
  readonly action: ReleaseAction;
  readonly argument: string;
}

export type Work = DeployWork | ReleaseWork;

/** One time some work was carried out on a project. */
export interface Run {
  readonly id: string;
  readonly state: RunState;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly commit?: string;
  readonly error?: string;
  readonly work: Work;
}

/** A run with everything it printed so far. */
export interface RunWithLines extends Run {
  readonly lines: readonly string[];
}

/** Thrown when the platform refuses a request, with its own reason. */
export class Refusal extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "Refusal";
  }
}

/** The platform's JSON API, as the web app calls it. */
export class Api {
  constructor(private readonly origin: string) {}

  projects(): Promise<ProjectSummary[]> {
    return this.call("GET", "/api/projects");
  }

  project(id: string): Promise<Project> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}`);
  }

  addProject(
    fields: { id: string; repository: string; ref: string },
  ): Promise<ProjectSummary> {
    return this.call("POST", "/api/projects", fields);
  }

  sync(id: string): Promise<void> {
    return this.call("POST", `/api/projects/${encodeURIComponent(id)}/sync`);
  }

  addEnvironment(
    project: string,
    manifest: string,
    name: string,
  ): Promise<Environment> {
    return this.call(
      "POST",
      `${this.manifestPath(project, manifest)}/environments`,
      { name },
    );
  }

  setValue(
    at: EnvironmentPath,
    kind: ValueKind,
    name: string,
    value: string,
  ): Promise<void> {
    return this.call("PUT", this.valuePath(at, kind, name), { value });
  }

  unsetValue(
    at: EnvironmentPath,
    kind: ValueKind,
    name: string,
  ): Promise<void> {
    return this.call("DELETE", this.valuePath(at, kind, name));
  }

  /** The project's released versions, newest first. */
  versions(project: string): Promise<string[]> {
    return this.call(
      "GET",
      `/api/projects/${encodeURIComponent(project)}/versions`,
    );
  }

  deploy(
    at: EnvironmentPath,
    request: { kit: string; version: string; termination: Termination },
  ): Promise<Run> {
    return this.call(
      "POST",
      `${this.manifestPath(at.project, at.manifest)}/environments/${
        encodeURIComponent(at.environment)
      }/deploys`,
      request,
    );
  }

  release(
    project: string,
    request: { action: ReleaseAction; argument: string },
  ): Promise<Run> {
    return this.call(
      "POST",
      `/api/projects/${encodeURIComponent(project)}/releases`,
      request,
    );
  }

  setCredential(project: string, name: string, value: string): Promise<void> {
    return this.call("PUT", this.credentialPath(project, name), { value });
  }

  unsetCredential(project: string, name: string): Promise<void> {
    return this.call("DELETE", this.credentialPath(project, name));
  }

  private credentialPath(project: string, name: string): string {
    return `/api/projects/${encodeURIComponent(project)}/credentials/${
      encodeURIComponent(name)
    }`;
  }

  /** A project's runs, newest first. */
  runs(project: string): Promise<Run[]> {
    return this.call(
      "GET",
      `/api/projects/${encodeURIComponent(project)}/runs`,
    );
  }

  run(id: string): Promise<RunWithLines> {
    return this.call("GET", `/api/runs/${encodeURIComponent(id)}`);
  }

  /** Where a run's progress is streamed from, as server-sent events. */
  runEvents(id: string): string {
    return `${this.origin}/api/runs/${encodeURIComponent(id)}/events`;
  }

  private manifestPath(project: string, manifest: string): string {
    return `/api/projects/${encodeURIComponent(project)}/manifests/${
      encodeURIComponent(manifest)
    }`;
  }

  private valuePath(
    at: EnvironmentPath,
    kind: ValueKind,
    name: string,
  ): string {
    return `${this.manifestPath(at.project, at.manifest)}/environments/${
      encodeURIComponent(at.environment)
    }/${kind}/${encodeURIComponent(name)}`;
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.origin}${path}`, {
      method,
      headers: body === undefined
        ? undefined
        : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Refusal(answer.error ?? response.statusText, response.status);
    }
    return answer as T;
  }
}

/** What went wrong, as a sentence for the screen. */
export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
