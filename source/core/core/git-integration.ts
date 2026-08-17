import { dirname, join } from "@std/path";
import { exists, walk } from "@std/fs";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { parseWorkflowFile } from "@ensemble/workflow";
import {
  type GitAuthStrategy,
  type GitRepositoryRecord,
  GitRepositoryStore,
  WorkflowGitLinkStore,
} from "./git-repositories.ts";

const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

/** Derives a project name from a git URL's last path segment (e.g. "https://github.com/acme/widgets.git" -> "widgets"). */
export function deriveProjectName(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const lastSegment = trimmed.split(/[/:]/).pop() ?? "";
  return lastSegment;
}

function assertValidProjectName(projectName: string): void {
  if (!PROJECT_NAME_PATTERN.test(projectName)) {
    throw new Error(
      `Invalid project name "${projectName}" — expected letters, digits, ".", "_", or "-", ` +
        `not starting or ending with a separator.`,
    );
  }
}

async function removeIfExists(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
}

async function gitCacheRoot(): Promise<string> {
  const repoRoot = await findRepoRoot();
  return join(repoRoot, ".ensemble", "platform", "git-repos");
}

/**
 * Extra `git` argv elements needed to authenticate as `auth`, prepended right
 * after `clone`/before the repo URL. `-c http.extraHeader=...` is passed as
 * its own discrete argument (dax spreads an interpolated array into separate
 * shell-escaped tokens) — the token never touches a shell string, is never
 * written into the resulting checkout's `.git/config` (a one-off `-c`
 * override doesn't persist), and never appears in the stored `repoUrl`.
 */
function buildGitAuthArgs(auth: GitAuthStrategy): string[] {
  if (auth.type === "pat") {
    return ["-c", `http.extraHeader=Authorization: Bearer ${auth.token}`];
  }
  return [];
}

/**
 * Sparse-checks out only the `workflows/` folder of a git repository into a
 * fresh staging directory (blobless, single commit) so a bad URL or a repo
 * lacking a workflows/ folder never touches the live cache. Caller is
 * responsible for moving what it needs out of the returned dir and then
 * removing the staging dir.
 */
async function sparseCloneWorkflows(
  record: Pick<GitRepositoryRecord, "repoUrl" | "auth">,
  stagingParentDir: string,
  label: string,
): Promise<string> {
  const stagingDir = join(
    stagingParentDir,
    `.git-integration-${label}-${crypto.randomUUID()}`,
  );
  const authArgs = buildGitAuthArgs(record.auth);

  const cloneResult =
    await $`git clone ${authArgs} --filter=blob:none --no-checkout --depth 1 ${record.repoUrl} ${stagingDir}`
      .stdout("null")
      .stderr("piped")
      .noThrow();
  if (cloneResult.code !== 0) {
    await removeIfExists(stagingDir);
    throw new Error(
      `Failed to clone "${record.repoUrl}": ${cloneResult.stderr.trim()}`,
    );
  }

  const sparseResult = await $`git sparse-checkout set --no-cone workflows`
    .cwd(stagingDir)
    .stdout("null")
    .stderr("piped")
    .noThrow();
  const checkoutResult = sparseResult.code === 0
    ? await $`git checkout`.cwd(stagingDir).stdout("null").stderr("piped")
      .noThrow()
    : sparseResult;
  if (checkoutResult.code !== 0) {
    await removeIfExists(stagingDir);
    throw new Error(
      `Failed to sparse-checkout "workflows/" from "${record.repoUrl}": ${checkoutResult.stderr.trim()}`,
    );
  }

  const clonedWorkflowsDir = join(stagingDir, "workflows");
  if (!await exists(clonedWorkflowsDir, { isDirectory: true })) {
    await removeIfExists(stagingDir);
    throw new Error(`"${record.repoUrl}" has no workflows/ folder.`);
  }

  return stagingDir;
}

/**
 * Re-fetches `record`'s repository into its cache dir
 * (`.ensemble/platform/git-repos/<projectName>`), replacing whatever was
 * cached there before. This is the one clone routine shared by registration
 * (to validate access), refresh, and reading candidate workflow content for
 * a sync — none of them touch `workflows/` directly; only
 * `syncWorkflowFromGit` copies out of this cache into a live workflow
 * directory, and only after validating the specific path it's copying.
 */
async function refreshRepoCache(
  record: Pick<GitRepositoryRecord, "projectName" | "repoUrl" | "auth">,
): Promise<string> {
  const cacheRoot = await gitCacheRoot();
  const targetDir = join(cacheRoot, record.projectName);

  const stagingDir = await sparseCloneWorkflows(
    record,
    cacheRoot,
    record.projectName,
  );
  const clonedWorkflowsDir = join(stagingDir, "workflows");

  await removeIfExists(targetDir);
  await Deno.mkdir(dirname(targetDir), { recursive: true });
  await Deno.rename(clonedWorkflowsDir, targetDir);
  await removeIfExists(stagingDir);

  return targetDir;
}

export interface RegisterGitRepositoryOptions {
  repoUrl: string;
  /** Defaults to the repo URL's last path segment. */
  projectName?: string;
  /** Defaults to { type: "none" } (public repo, no credentials). */
  auth?: GitAuthStrategy;
  /** This repo's X25519 private key, so workflows linked to it can decrypt context.secrets when triggered here. Optional — a repo with no encrypted secrets doesn't need one. */
  secretsKey?: string;
}

/**
 * Registers a git repository: validates access by cloning its `workflows/`
 * folder into a cache dir under `.ensemble/platform/git-repos/<projectName>`
 * (never `workflows/` itself — registration creates no workflow directories),
 * then persists a GitRepositoryRecord so it can later be listed, refreshed,
 * removed, or used as a source for syncing an individual workflow's content.
 */
export async function registerGitRepository(
  repositories: GitRepositoryStore,
  options: RegisterGitRepositoryOptions,
): Promise<GitRepositoryRecord> {
  const projectName = options.projectName?.trim() ||
    deriveProjectName(options.repoUrl);
  assertValidProjectName(projectName);
  const auth = options.auth ?? { type: "none" };

  await refreshRepoCache({ projectName, repoUrl: options.repoUrl, auth });

  const now = new Date().toISOString();
  const record: GitRepositoryRecord = {
    projectName,
    repoUrl: options.repoUrl,
    auth,
    registeredAt: now,
    lastFetchedAt: now,
    secretsKey: options.secretsKey,
  };
  await repositories.put(record);
  return record;
}

/** Sets or rotates an already-registered repository's secrets private key, without re-registering (which would otherwise require re-validating clone access and re-supplying the PAT). */
export async function setRepositorySecretsKey(
  repositories: GitRepositoryStore,
  projectName: string,
  secretsKey: string,
): Promise<GitRepositoryRecord> {
  const record = await repositories.get(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not registered.`);
  }
  const updated: GitRepositoryRecord = { ...record, secretsKey };
  await repositories.put(updated);
  return updated;
}

/** Re-fetches an already-registered repository's cached checkout. Does not touch any workflow directory. */
export async function refreshGitRepository(
  repositories: GitRepositoryStore,
  projectName: string,
): Promise<GitRepositoryRecord> {
  const record = await repositories.get(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not registered.`);
  }

  await refreshRepoCache(record);

  const updated: GitRepositoryRecord = {
    ...record,
    lastFetchedAt: new Date().toISOString(),
  };
  await repositories.put(updated);
  return updated;
}

/**
 * Removes a registered repository entirely: its cached checkout and its
 * persisted record. Does not touch `workflows/` or any WorkflowGitLink —
 * a workflow previously synced from this repo keeps its last-synced content;
 * only the ability to re-sync it from this repo is lost (its link now points
 * at a project that no longer resolves).
 */
export async function removeGitRepository(
  repositories: GitRepositoryStore,
  projectName: string,
): Promise<void> {
  const cacheRoot = await gitCacheRoot();
  await removeIfExists(join(cacheRoot, projectName));
  await repositories.delete(projectName);
}

/**
 * Every candidate workflow in `projectName`'s repo (relative paths within
 * its own `workflows/` folder, e.g. "deploy" for workflows/deploy/workflow.yml)
 * a user could sync into a local workflow — refreshes the repo's cache first
 * so the list reflects its current default-branch content. A workflow with
 * no `on:` trigger is still included (a synced workflow might reasonably be
 * invocation-only) but flagged via `hasTrigger: false`, purely as a UI hint.
 */
export interface RepoWorkflowCandidate {
  pathInRepo: string;
  hasTrigger: boolean;
}

export async function listRepoWorkflowCandidates(
  repositories: GitRepositoryStore,
  projectName: string,
): Promise<RepoWorkflowCandidate[]> {
  const record = await repositories.get(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not registered.`);
  }

  const cacheDir = await refreshRepoCache(record);
  await repositories.put({
    ...record,
    lastFetchedAt: new Date().toISOString(),
  });

  const candidates: RepoWorkflowCandidate[] = [];
  for await (
    const entry of walk(cacheDir, {
      match: [/workflow\.yml$/],
      includeDirs: false,
    })
  ) {
    const workflowDir = dirname(entry.path);
    const pathInRepo = workflowDir.slice(cacheDir.length + 1) || ".";
    const workflow = await parseWorkflowFile(entry.path).catch(() => undefined);
    candidates.push({
      pathInRepo,
      hasTrigger: Boolean(workflow?.on && workflow.on.length > 0),
    });
  }
  return candidates;
}

/**
 * Syncs one workflow's on-disk content from `pathInRepo` within
 * `projectName`'s registered repo: refreshes the repo's cache, validates the
 * candidate's `workflow.yml` parses (staged — never touching the live
 * workflow dir until valid, same safety property as the plain upload
 * endpoint), replaces `workflows/<workflowName>/` with it, and records the
 * link so a later "sync now" knows what to re-fetch.
 */
export async function syncWorkflowFromGit(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
  workflowName: string,
  projectName: string,
  pathInRepo: string,
): Promise<void> {
  const record = await repositories.get(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not registered.`);
  }

  const cacheDir = await refreshRepoCache(record);
  await repositories.put({
    ...record,
    lastFetchedAt: new Date().toISOString(),
  });

  const candidateDir = join(cacheDir, pathInRepo);
  const candidateWorkflowFile = join(candidateDir, "workflow.yml");
  if (!await exists(candidateWorkflowFile, { isFile: true })) {
    throw new Error(
      `"${pathInRepo}" in "${record.repoUrl}" has no workflow.yml.`,
    );
  }
  await parseWorkflowFile(candidateWorkflowFile);

  const repoRoot = await findRepoRoot();
  const targetDir = join(repoRoot, "workflows", workflowName);
  await removeIfExists(targetDir);
  await Deno.mkdir(dirname(targetDir), { recursive: true });
  await copyDir(candidateDir, targetDir);

  await links.put({
    workflowName,
    projectName,
    pathInRepo,
    syncedAt: new Date().toISOString(),
  });
}

async function copyDir(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory) {
      await copyDir(srcPath, destPath);
    } else {
      await Deno.copyFile(srcPath, destPath);
    }
  }
}

/** Drops `workflowName`'s git link, e.g. when the workflow itself is deleted. Leaves its content on disk untouched. */
export async function unlinkWorkflowFromGit(
  links: WorkflowGitLinkStore,
  workflowName: string,
): Promise<void> {
  await links.delete(workflowName);
}
