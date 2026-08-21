/**
 * How the server authenticates to a registered git repository when cloning
 * it. A discriminated union so a future strategy (e.g. a GitHub App
 * installation) can be added as a new variant without migrating existing
 * records — every reader must switch on `type`.
 */
export type GitAuthStrategy =
  | { type: "none" }
  | { type: "pat"; token: string };

export interface GitRepositoryRecord {
  projectName: string;
  repoUrl: string;
  auth: GitAuthStrategy;
  registeredAt: string;
  /** Set once the validation/refresh clone into .ensemble/platform/git-repos/<projectName> has actually run. */
  lastFetchedAt?: string;
  /**
   * The remote default branch's HEAD commit SHA as of `lastFetchedAt`, so a
   * later refresh can skip re-cloning when the remote hasn't moved — see
   * refreshRepoCache's doc comment. Unset for a record written before this
   * field existed; that just means the next refresh clones unconditionally,
   * same as today.
   */
  lastFetchedSha?: string;
  /**
   * This repo's X25519 private key (base64 pkcs8 — see
   * @ensemble/workflow's context-loaders/secrets-crypto.ts), used to decrypt
   * contexts/<name>/secrets.yml for any workflow linked to this repo when
   * its run is containerized (see run-workflow-in-container.ts). Optional:
   * a repo registered before this field existed, or whose workflows never
   * declare context.secrets, has none — decryption then simply isn't
   * available for that repo's runs, same graceful-degradation shape as a
   * missing ENSEMBLE_SECRETS_KEY always had. Same trust tier as `auth`'s
   * PAT — never returned by any list/summary endpoint.
   */
  secretsKey?: string;
}

/** Links one workflow's on-disk content to where it was last synced from in a registered repo, so a later "sync now" knows what to re-fetch. */
export interface WorkflowGitLink {
  workflowName: string;
  projectName: string;
  /** Path within the repo's own workflows/ folder, e.g. "deploy" for workflows/deploy/workflow.yml. */
  pathInRepo: string;
  syncedAt: string;
}

/**
 * Persists registered git repositories. Takes its `Deno.Kv` connection via
 * constructor injection — opened once by the caller (an entrypoint, e.g.
 * apps/server/main.ts/apps/cli/main.ts) rather than lazily inside this
 * module, so tests can construct a store against an isolated instance
 * instead of sharing one process-wide connection.
 */
export class GitRepositoryStore {
  constructor(private readonly kv: Deno.Kv) {}

  /** All registered git repositories, in no particular order. */
  async list(): Promise<GitRepositoryRecord[]> {
    const out: GitRepositoryRecord[] = [];
    for await (
      const entry of this.kv.list<GitRepositoryRecord>({
        prefix: ["git-repositories"],
      })
    ) {
      out.push(entry.value);
    }
    return out;
  }

  async get(projectName: string): Promise<GitRepositoryRecord | undefined> {
    const entry = await this.kv.get<GitRepositoryRecord>([
      "git-repositories",
      projectName,
    ]);
    return entry.value ?? undefined;
  }

  /** Inserts or fully overwrites a repository's record (e.g. after registration or a refresh). */
  async put(record: GitRepositoryRecord): Promise<void> {
    await this.kv.set(["git-repositories", record.projectName], record);
  }

  async delete(projectName: string): Promise<void> {
    await this.kv.delete(["git-repositories", projectName]);
  }
}

/**
 * Persists workflow↔repo git links. Same constructor-injection shape as
 * GitRepositoryStore, and a separate class (not folded into it) since the
 * two persist to distinct `Deno.Kv` files and have no shared state.
 */
export class WorkflowGitLinkStore {
  constructor(private readonly kv: Deno.Kv) {}

  async get(workflowName: string): Promise<WorkflowGitLink | undefined> {
    const entry = await this.kv.get<WorkflowGitLink>([
      "workflow-git-links",
      workflowName,
    ]);
    return entry.value ?? undefined;
  }

  /** Inserts or fully overwrites a workflow's git link (e.g. after a sync). */
  async put(link: WorkflowGitLink): Promise<void> {
    await this.kv.set(["workflow-git-links", link.workflowName], link);
  }

  async delete(workflowName: string): Promise<void> {
    await this.kv.delete(["workflow-git-links", workflowName]);
  }

  /** All workflows currently linked to `projectName`, in no particular order. */
  async listForProject(projectName: string): Promise<WorkflowGitLink[]> {
    const out: WorkflowGitLink[] = [];
    for await (
      const entry of this.kv.list<WorkflowGitLink>({
        prefix: ["workflow-git-links"],
      })
    ) {
      if (entry.value.projectName === projectName) out.push(entry.value);
    }
    return out;
  }

  /** Every workflow's git link, in no particular order — used to refresh all of them (e.g. from a GitHub webhook that doesn't know in advance which project a pushed tag targets). */
  async listAll(): Promise<WorkflowGitLink[]> {
    const out: WorkflowGitLink[] = [];
    for await (
      const entry of this.kv.list<WorkflowGitLink>({
        prefix: ["workflow-git-links"],
      })
    ) {
      out.push(entry.value);
    }
    return out;
  }
}

/** Where each store's `Deno.Kv` file lives, relative to the repo root — for entrypoints to open. */
export const GIT_REPOSITORY_STORE_KV_PATH =
  ".ensemble/platform/git-repositories.kv";
export const WORKFLOW_GIT_LINK_STORE_KV_PATH =
  ".ensemble/platform/workflow-git-links.kv";
