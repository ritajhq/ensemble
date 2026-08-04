import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";

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
 * repos' workflows can't collide by name. Clones into a staging directory
 * first (blobless, single commit) so a bad URL or a repo lacking a
 * workflows/ folder never touches the live workflows/ tree.
 */
export async function cloneWorkflowsFromGit(
  options: CloneWorkflowsFromGitOptions,
): Promise<CloneWorkflowsFromGitResult> {
  const projectName = options.projectName?.trim() || deriveProjectName(options.repoUrl);
  assertValidProjectName(projectName);

  const repoRoot = await findRepoRoot();
  const workflowsDir = join(repoRoot, "workflows");
  const targetDir = join(workflowsDir, projectName);
  const stagingDir = join(workflowsDir, `.git-integration-${projectName}-${crypto.randomUUID()}`);

  const cloneResult = await $`git clone --filter=blob:none --no-checkout --depth 1 ${options.repoUrl} ${stagingDir}`
    .stdout("null")
    .stderr("piped")
    .noThrow();
  if (cloneResult.code !== 0) {
    await removeIfExists(stagingDir);
    throw new Error(`Failed to clone "${options.repoUrl}": ${cloneResult.stderr.trim()}`);
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
    throw new Error(
      `Failed to sparse-checkout "workflows/" from "${options.repoUrl}": ${checkoutResult.stderr.trim()}`,
    );
  }

  const clonedWorkflowsDir = join(stagingDir, "workflows");
  if (!await exists(clonedWorkflowsDir, { isDirectory: true })) {
    await removeIfExists(stagingDir);
    throw new Error(`"${options.repoUrl}" has no workflows/ folder.`);
  }

  if (await exists(targetDir)) {
    await removeIfExists(targetDir);
  }
  await Deno.rename(clonedWorkflowsDir, targetDir);
  await removeIfExists(stagingDir);

  return { projectName, workflowsDir: targetDir };
}

async function removeIfExists(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
}
