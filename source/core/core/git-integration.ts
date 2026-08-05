import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import {
  deleteGitRepository,
  type GitRepositoryRecord,
  getGitRepository,
  markWorkflowRemoved,
  markWorkflowRestored,
  putGitRepository,
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

/**
 * Sparse-checks out only the `workflows/` folder of a git repository into a
 * fresh staging directory (blobless, single commit) so a bad URL or a repo
 * lacking a workflows/ folder never touches the live workflows/ tree. Caller
 * is responsible for moving what it needs out of the returned dir and then
 * removing the staging dir.
 */
async function sparseCloneWorkflows(repoUrl: string, workflowsDir: string, projectName: string): Promise<string> {
  const stagingDir = join(workflowsDir, `.git-integration-${projectName}-${crypto.randomUUID()}`);

  const cloneResult = await $`git clone --filter=blob:none --no-checkout --depth 1 ${repoUrl} ${stagingDir}`
    .stdout("null")
    .stderr("piped")
    .noThrow();
  if (cloneResult.code !== 0) {
    await removeIfExists(stagingDir);
    throw new Error(`Failed to clone "${repoUrl}": ${cloneResult.stderr.trim()}`);
  }

  const sparseResult = await $`git sparse-checkout set --no-cone workflows`
    .cwd(stagingDir)
    .stdout("null")
    .stderr("piped")
    .noThrow();
  const checkoutResult = sparseResult.code === 0
    ? await $`git checkout`.cwd(stagingDir).stdout("null").stderr("piped").noThrow()
    : sparseResult;
  if (checkoutResult.code !== 0) {
    await removeIfExists(stagingDir);
    throw new Error(`Failed to sparse-checkout "workflows/" from "${repoUrl}": ${checkoutResult.stderr.trim()}`);
  }

  const clonedWorkflowsDir = join(stagingDir, "workflows");
  if (!await exists(clonedWorkflowsDir, { isDirectory: true })) {
    await removeIfExists(stagingDir);
    throw new Error(`"${repoUrl}" has no workflows/ folder.`);
  }

  return stagingDir;
}

export interface CloneWorkflowsFromGitOptions {
  repoUrl: string;
  /** Defaults to the repo URL's last path segment. */
  projectName?: string;
}

export interface CloneWorkflowsFromGitResult {
  projectName: string;
  workflowsDir: string;
}

/**
 * Sparse-checks out only the `workflows/` folder of a git repository and
 * lands it at workflows/<projectName>/ in this repo, so multiple integrated
 * repos' workflows can't collide by name. Replaces the whole projectName/
 * directory (clearing any per-workflow removals previously recorded) and
 * persists a GitRepositoryRecord so the repo can later be listed, refreshed,
 * or removed.
 */
export async function cloneWorkflowsFromGit(
  options: CloneWorkflowsFromGitOptions,
): Promise<CloneWorkflowsFromGitResult> {
  const projectName = options.projectName?.trim() || deriveProjectName(options.repoUrl);
  assertValidProjectName(projectName);

  const repoRoot = await findRepoRoot();
  const workflowsDir = join(repoRoot, "workflows");
  const targetDir = join(workflowsDir, projectName);

  const stagingDir = await sparseCloneWorkflows(options.repoUrl, workflowsDir, projectName);
  const clonedWorkflowsDir = join(stagingDir, "workflows");

  if (await exists(targetDir)) {
    await removeIfExists(targetDir);
  }
  await Deno.rename(clonedWorkflowsDir, targetDir);
  await removeIfExists(stagingDir);

  await putGitRepository({
    projectName,
    repoUrl: options.repoUrl,
    clonedAt: new Date().toISOString(),
    removedWorkflows: [],
  });

  return { projectName, workflowsDir: targetDir };
}

/** Re-clones an already-integrated repository, refreshing every workflow currently present under it (previously-removed workflows stay removed). */
export async function refreshGitRepository(projectName: string): Promise<GitRepositoryRecord> {
  const record = await getGitRepository(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not integrated.`);
  }

  const repoRoot = await findRepoRoot();
  const workflowsDir = join(repoRoot, "workflows");
  const targetDir = join(workflowsDir, projectName);

  const stagingDir = await sparseCloneWorkflows(record.repoUrl, workflowsDir, projectName);
  const clonedWorkflowsDir = join(stagingDir, "workflows");

  for (const removedWorkflow of record.removedWorkflows) {
    await removeIfExists(join(clonedWorkflowsDir, removedWorkflow));
  }

  await removeIfExists(targetDir);
  await Deno.rename(clonedWorkflowsDir, targetDir);
  await removeIfExists(stagingDir);

  const updated: GitRepositoryRecord = { ...record, clonedAt: new Date().toISOString() };
  await putGitRepository(updated);
  return updated;
}

/** Removes an integrated repository entirely: its workflows/<projectName>/ directory and its persisted record. */
export async function removeGitRepository(projectName: string): Promise<void> {
  const repoRoot = await findRepoRoot();
  const targetDir = join(repoRoot, "workflows", projectName);
  await removeIfExists(targetDir);
  await deleteGitRepository(projectName);
}

/** Removes a single workflow's directory from an integrated repo's project, without affecting sibling workflows. */
export async function removeGitRepositoryWorkflow(projectName: string, workflowName: string): Promise<void> {
  const record = await getGitRepository(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not integrated.`);
  }

  const repoRoot = await findRepoRoot();
  const workflowDir = join(repoRoot, "workflows", projectName, workflowName);
  await removeIfExists(workflowDir);
  await markWorkflowRemoved(projectName, workflowName);
}

/**
 * Re-clones just enough of an integrated repo to (re)fetch one workflow's
 * current directory from git, leaving its siblings untouched. Works for both
 * a previously-removed workflow (restoring it) and one that's already
 * present (refetching its latest content) — either way it un-marks the
 * workflow as removed.
 */
export async function restoreGitRepositoryWorkflow(projectName: string, workflowName: string): Promise<void> {
  const record = await getGitRepository(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not integrated.`);
  }

  const repoRoot = await findRepoRoot();
  const workflowsDir = join(repoRoot, "workflows");
  const targetWorkflowDir = join(workflowsDir, projectName, workflowName);

  const stagingDir = await sparseCloneWorkflows(record.repoUrl, workflowsDir, projectName);
  const clonedWorkflowDir = join(stagingDir, "workflows", workflowName);
  if (!await exists(clonedWorkflowDir, { isDirectory: true })) {
    await removeIfExists(stagingDir);
    throw new Error(`Workflow "${workflowName}" no longer exists in "${record.repoUrl}".`);
  }

  await removeIfExists(targetWorkflowDir);
  await Deno.rename(clonedWorkflowDir, targetWorkflowDir);
  await removeIfExists(stagingDir);

  await markWorkflowRestored(projectName, workflowName);
}
