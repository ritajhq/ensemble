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

export interface Manifest {
  readonly name: string;
  readonly ships: readonly string[];
  readonly variables: readonly Variable[];
  readonly secrets: readonly string[];
  readonly environments: readonly { id: string; name: string }[];
}

export interface Project extends ProjectSummary {
  readonly catalog?: {
    readonly commit: string;
    readonly kits: readonly string[];
    readonly problems: readonly { manifest: string; message: string }[];
    readonly manifests: readonly Manifest[];
  };
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
