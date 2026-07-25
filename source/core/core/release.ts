import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  preRelease?: string;
  meta?: string;
}

const SEMVER_TAG_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const BARE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function parseSemVerTag(tag: string): SemVer | undefined {
  const match = SEMVER_TAG_PATTERN.exec(tag);
  if (!match) return undefined;
  const [, major, minor, patch, preRelease, meta] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), preRelease, meta };
}

/**
 * Semver precedence: build metadata is ignored, and a pre-release version
 * has lower precedence than its associated normal version.
 */
function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  const aPre = a.preRelease !== undefined;
  const bPre = b.preRelease !== undefined;
  if (aPre !== bPre) return aPre ? -1 : 1;
  if (aPre && bPre) return a.preRelease! < b.preRelease! ? -1 : a.preRelease! > b.preRelease! ? 1 : 0;
  return 0;
}

function formatTag(version: SemVer): string {
  let tag = `${version.major}.${version.minor}.${version.patch}`;
  if (version.preRelease) tag += `-${version.preRelease}`;
  if (version.meta) tag += `+${version.meta}`;
  return tag;
}

async function listSemVerTags(repoRoot: string): Promise<{ tag: string; version: SemVer }[]> {
  const output = await $`git tag --list`.cwd(repoRoot).text();
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((tag) => ({ tag, version: parseSemVerTag(tag) }))
    .filter((entry): entry is { tag: string; version: SemVer } => entry.version !== undefined);
}

/** The highest tag by semver precedence, not the most recently created one — tags don't have to be created in version order. */
async function findLastTag(repoRoot: string): Promise<{ tag: string; version: SemVer } | undefined> {
  const tags = await listSemVerTags(repoRoot);
  if (tags.length === 0) return undefined;
  return tags.reduce((max, t) => (compareSemVer(t.version, max.version) > 0 ? t : max));
}

/** True if the working tree has uncommitted changes (staged, unstaged, or untracked). */
export async function hasUncommittedChanges(repoRoot: string): Promise<boolean> {
  const output = await $`git status --porcelain`.cwd(repoRoot).text();
  return output.trim().length > 0;
}

/** Pushes the current branch's commits to the given remote. */
export async function pushCommits(repoRoot: string, remote: string): Promise<void> {
  await $`git push ${remote} HEAD`.cwd(repoRoot);
}

/** Pushes a single tag to the given remote. */
export async function pushTag(repoRoot: string, tag: string, remote: string): Promise<void> {
  await $`git push ${remote} ${tag}`.cwd(repoRoot);
}

/** Deletes a tag from the given remote. */
export async function deleteRemoteTag(repoRoot: string, tag: string, remote: string): Promise<void> {
  await $`git push ${remote} --delete ${tag}`.cwd(repoRoot);
}

export interface ReleaseFlags {
  dryRun?: boolean;
  preRelease?: string;
  meta?: string;
}

export interface ReleasePreview {
  tag: string;
  lastTag?: string;
}

async function buildPreview(repoRoot: string, base: SemVer, flags: ReleaseFlags): Promise<ReleasePreview> {
  const last = await findLastTag(repoRoot);
  const version: SemVer = { ...base, preRelease: flags.preRelease, meta: flags.meta };
  const tag = formatTag(version);
  return { tag, lastTag: last?.tag };
}

export type BumpKind = "major" | "minor" | "patch";

/** Previews the version bump from the last tag per semver rules. No tags yet behaves as if the last tag were 0.0.0. Does not create the tag — call applyRelease separately once confirmed. */
export async function releaseNext(bump: BumpKind, flags: ReleaseFlags): Promise<ReleasePreview> {
  const repoRoot = await findRepoRoot();
  const last = await findLastTag(repoRoot);
  const base = last?.version ?? { major: 0, minor: 0, patch: 0 };
  const bumped: SemVer = bump === "major"
    ? { major: base.major + 1, minor: 0, patch: 0 }
    : bump === "minor"
    ? { major: base.major, minor: base.minor + 1, patch: 0 }
    : { major: base.major, minor: base.minor, patch: base.patch + 1 };

  return await buildPreview(repoRoot, bumped, flags);
}

/** Previews an arbitrary version. Must be exactly "x.y.z" — use preRelease/meta flags for those suffixes. Does not create the tag — call applyRelease separately once confirmed. */
export async function releaseSet(version: string, flags: ReleaseFlags): Promise<ReleasePreview> {
  if (!BARE_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version "${version}" — expected the shape x.y.z (e.g. 1.2.3).`);
  }
  const repoRoot = await findRepoRoot();
  const [major, minor, patch] = version.split(".").map(Number);
  return await buildPreview(repoRoot, { major, minor, patch }, flags);
}

/** Creates the tag locally, once the caller has confirmed all prompts. Pushing is a separate, explicit step (see pushCommits/pushTag). */
export async function createReleaseTag(repoRoot: string, preview: ReleasePreview): Promise<void> {
  await $`git tag ${preview.tag}`.cwd(repoRoot);
}

export interface UndoFlags {
  dryRun?: boolean;
}

export interface UndoResult {
  tag: string;
}

/** Deletes only the last (highest-semver) tag locally — never touches any commit. Deleting from a remote is a separate, explicit step (see deleteRemoteTag). */
export async function releaseUndo(flags: UndoFlags): Promise<UndoResult> {
  const repoRoot = await findRepoRoot();
  const last = await findLastTag(repoRoot);
  if (!last) {
    throw new Error("No semver tags found to undo.");
  }
  if (flags.dryRun) {
    return { tag: last.tag };
  }
  await $`git tag -d ${last.tag}`.cwd(repoRoot);
  return { tag: last.tag };
}
