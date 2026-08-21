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
 *
 * GitHub's git-over-HTTPS transport (unlike its REST/Contents API — see
 * git-write.ts, which correctly uses `Authorization: Bearer` there) only
 * accepts HTTP Basic auth for a PAT, classic or fine-grained: username
 * `x-access-token`, password the token itself. A `Bearer` header here isn't
 * recognized at all — GitHub's git-http-backend responds as if no
 * credential was offered, which (with no git credential helper configured)
 * surfaces as git's generic "could not read Username ... No such device or
 * address" instead of an actual auth-rejected error, regardless of whether
 * the token itself is valid.
 */
function buildGitAuthArgs(auth: GitAuthStrategy): string[] {
  if (auth.type === "pat") {
    const basic = btoa(`x-access-token:${auth.token}`);
    return ["-c", `http.extraHeader=Authorization: Basic ${basic}`];
  }
  return [];
}

/**
 * Lists tag names from a remote repository via `git ls-remote --tags`, newest
 * first — no clone needed. If `repoUrl` matches a registered repository's
 * `repoUrl`, reuses its stored auth so a private repo's tags are still
 * listable; otherwise fetches unauthenticated. Peeled refs (`^{}`, an
 * annotated tag's underlying commit) are skipped so each tag name appears
 * once. Returns an empty list (rather than throwing) if the remote can't be
 * reached or has no tags — a `git-tags` input degrades to free text in that
 * case, same as any other input a UI can't pre-populate.
 */
export async function listRemoteGitTags(
  repositories: GitRepositoryStore,
  repoUrl: string,
): Promise<string[]> {
  const registered = await repositories.list();
  const match = registered.find((record) => record.repoUrl === repoUrl);
  const auth: GitAuthStrategy = match?.auth ?? { type: "none" };
  const authArgs = buildGitAuthArgs(auth);

  const result = await $`git ls-remote ${authArgs} --tags --refs ${repoUrl}`
    .stdout("piped")
    .stderr("null")
    .noThrow();
  if (result.code !== 0) return [];

  const tags = result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("refs/tags/")[1])
    .filter((tag): tag is string => Boolean(tag))
    .reverse();

  return tags;
}

/**
 * The remote default branch's current HEAD commit SHA, via `git ls-remote`
 * (no clone). Returns undefined if the remote can't be reached or has no
 * HEAD — refreshRepoCache treats that the same as "unknown, clone to be
 * safe" rather than failing here, since the clone itself will surface a
 * clearer error.
 */
async function remoteHeadSha(
  record: Pick<GitRepositoryRecord, "repoUrl" | "auth">,
): Promise<string | undefined> {
  const authArgs = buildGitAuthArgs(record.auth);
  const result = await $`git ls-remote ${authArgs} ${record.repoUrl} HEAD`
    .stdout("piped")
    .stderr("null")
    .noThrow();
  if (result.code !== 0) return undefined;
  const sha = result.stdout.trim().split(/\s+/)[0];
  return sha || undefined;
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
    const stderr = cloneResult.stderr.trim();
    // GitHub rejecting a bad PAT doesn't read the same everywhere: with no
    // git credential helper configured (true of this process's own
    // container — see server/README), git falls through to trying an
    // interactive username/password prompt and fails with an opaque
    // "could not read Username ... no such device" instead of ever naming
    // the real problem; elsewhere (a credential helper present) it's a
    // cleaner "Authentication failed"/"invalid credentials". Reword either
    // shape into something actionable whenever we know a PAT was actually
    // offered.
    const looksLikeRejectedPat = /could not read username/i.test(stderr) ||
      /authentication failed/i.test(stderr) ||
      /invalid credentials/i.test(stderr);
    if (record.auth.type === "pat" && looksLikeRejectedPat) {
      throw new Error(
        `GitHub rejected the personal access token for "${record.repoUrl}" — check that it's still valid and has read access to this repository (raw git error: ${stderr}).`,
      );
    }
    throw new Error(
      `Failed to clone "${record.repoUrl}": ${stderr}`,
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

/** `refreshRepoCache`'s result: where the refreshed cache landed, and the remote SHA it now reflects (for callers to persist as `lastFetchedSha`). */
export interface RefreshedRepoCache {
  cacheDir: string;
  sha: string | undefined;
}

/**
 * Re-fetches `record`'s repository into its cache dir
 * (`.ensemble/platform/git-repos/<projectName>`), replacing whatever was
 * cached there before. This is the one clone routine shared by registration
 * (to validate access), refresh, and reading candidate workflow content for
 * a sync — none of them touch `workflows/` directly; only
 * `syncWorkflowFromGit` copies out of this cache into a live workflow
 * directory, and only after validating the specific path it's copying.
 *
 * Checks the remote's current HEAD SHA first (a cheap `git ls-remote`, no
 * clone) and skips the clone entirely when it matches `record.lastFetchedSha`
 * and the cache dir is still there — the common case for an unchanged repo,
 * and the thing that made every `GET /v1/workflows/:id` for a git-linked
 * workflow pay for a full clone even when nothing had changed. Falls back to
 * a real clone whenever the SHA can't be determined (offline remote,
 * ls-remote failure) or the cache dir is missing, so this never trades
 * correctness for speed.
 */
async function refreshRepoCache(
  record: Pick<GitRepositoryRecord, "projectName" | "repoUrl" | "auth" | "lastFetchedSha">,
): Promise<RefreshedRepoCache> {
  const cacheRoot = await gitCacheRoot();
  const targetDir = join(cacheRoot, record.projectName);

  const sha = await remoteHeadSha(record);
  if (sha && sha === record.lastFetchedSha && await exists(targetDir, { isDirectory: true })) {
    return { cacheDir: targetDir, sha };
  }

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

  return { cacheDir: targetDir, sha };
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

  const { sha } = await refreshRepoCache({ projectName, repoUrl: options.repoUrl, auth });

  const now = new Date().toISOString();
  const record: GitRepositoryRecord = {
    projectName,
    repoUrl: options.repoUrl,
    auth,
    registeredAt: now,
    lastFetchedAt: now,
    lastFetchedSha: sha,
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

/**
 * Updates an already-registered repository's access credentials (auth
 * strategy — public or a PAT), without re-registering: re-registering the
 * same projectName would silently drop its secretsKey (registerGitRepository
 * always writes a whole new record). repoUrl/projectName themselves aren't
 * changeable here — those are fixed for a registered repo's lifetime; remove
 * and re-register to point at a different URL. Re-validates clone access
 * with the new auth the same way registration does, so a bad/wrongly-scoped
 * PAT fails loudly here rather than silently at the next refresh/sync.
 * Deliberately omits `lastFetchedSha` when calling refreshRepoCache (even
 * though `record` may have one from before) so the SHA check never
 * short-circuits this clone — the point here is proving the *new*
 * credentials actually work, not skipping work.
 */
export async function setRepositoryAuth(
  repositories: GitRepositoryStore,
  projectName: string,
  auth: GitAuthStrategy,
): Promise<GitRepositoryRecord> {
  const record = await repositories.get(projectName);
  if (!record) {
    throw new Error(`Repository "${projectName}" is not registered.`);
  }
  const { sha } = await refreshRepoCache({
    projectName,
    repoUrl: record.repoUrl,
    auth,
    lastFetchedSha: undefined,
  });

  const updated: GitRepositoryRecord = {
    ...record,
    auth,
    lastFetchedAt: new Date().toISOString(),
    lastFetchedSha: sha,
  };
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

  const { sha } = await refreshRepoCache(record);

  const updated: GitRepositoryRecord = {
    ...record,
    lastFetchedAt: new Date().toISOString(),
    lastFetchedSha: sha,
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

  const { cacheDir, sha } = await refreshRepoCache(record);
  await repositories.put({
    ...record,
    lastFetchedAt: new Date().toISOString(),
    lastFetchedSha: sha,
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

  const existingLink = await links.get(workflowName);
  const alreadySynced = existingLink?.projectName === projectName &&
    existingLink?.pathInRepo === pathInRepo;

  const { cacheDir, sha } = await refreshRepoCache(record);
  const repoUnchanged = alreadySynced && sha !== undefined &&
    sha === record.lastFetchedSha;
  await repositories.put({
    ...record,
    lastFetchedAt: new Date().toISOString(),
    lastFetchedSha: sha,
  });

  const candidateDir = join(cacheDir, pathInRepo);
  const candidateWorkflowFile = join(candidateDir, "workflow.yml");
  if (!await exists(candidateWorkflowFile, { isFile: true })) {
    throw new Error(
      `"${pathInRepo}" in "${record.repoUrl}" has no workflow.yml.`,
    );
  }

  // The repo cache itself was reused as-is (unchanged SHA) and this
  // workflow was already synced from this same repo/path, so the live
  // workflow dir already reflects it — skip re-parsing and re-copying.
  if (repoUnchanged) return;

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
