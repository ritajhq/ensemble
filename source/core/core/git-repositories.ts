import { findRepoRoot } from "./repo.ts";

export interface GitRepositoryRecord {
  projectName: string;
  repoUrl: string;
  clonedAt: string;
  /** Workflow names (relative to the repo's own workflows/ folder) removed from this project without dropping the repo itself. */
  removedWorkflows: string[];
}

let kvPromise: Promise<Deno.Kv> | undefined;

async function getKv(): Promise<Deno.Kv> {
  if (!kvPromise) {
    kvPromise = (async () => {
      const repoRoot = await findRepoRoot();
      return await Deno.openKv(`${repoRoot}/.ensemble/platform/git-repositories.kv`);
    })();
  }
  return kvPromise;
}

/** All integrated git repositories, in no particular order. */
export async function listGitRepositories(): Promise<GitRepositoryRecord[]> {
  const kv = await getKv();
  const out: GitRepositoryRecord[] = [];
  for await (const entry of kv.list<GitRepositoryRecord>({ prefix: ["git-repositories"] })) {
    out.push(entry.value);
  }
  return out;
}

export async function getGitRepository(projectName: string): Promise<GitRepositoryRecord | undefined> {
  const kv = await getKv();
  const entry = await kv.get<GitRepositoryRecord>(["git-repositories", projectName]);
  return entry.value ?? undefined;
}

/** Inserts or fully overwrites a repository's record (e.g. after a fresh clone or a refresh). */
export async function putGitRepository(record: GitRepositoryRecord): Promise<void> {
  const kv = await getKv();
  await kv.set(["git-repositories", record.projectName], record);
}

export async function deleteGitRepository(projectName: string): Promise<void> {
  const kv = await getKv();
  await kv.delete(["git-repositories", projectName]);
}

/** Records that `workflowName` was removed from `projectName` without touching the rest of the repo's record. */
export async function markWorkflowRemoved(projectName: string, workflowName: string): Promise<void> {
  const record = await getGitRepository(projectName);
  if (!record) return;
  if (record.removedWorkflows.includes(workflowName)) return;
  await putGitRepository({ ...record, removedWorkflows: [...record.removedWorkflows, workflowName] });
}

/** Un-records `workflowName` as removed, e.g. once it's been restored to disk. */
async function markWorkflowRestored(projectName: string, workflowName: string): Promise<void> {
  const record = await getGitRepository(projectName);
  if (!record) return;
  await putGitRepository({
    ...record,
    removedWorkflows: record.removedWorkflows.filter((name) => name !== workflowName),
  });
}

export { markWorkflowRestored };
