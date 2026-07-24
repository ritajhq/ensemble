import { join } from "@std/path";
import { exists } from "@std/fs";
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

async function collectCommitMessages(repoRoot: string, sinceTag: string | undefined): Promise<string[]> {
  const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
  const output = await $`git log ${range} --pretty=format:%s`.cwd(repoRoot).text();
  return output.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

const CHANGELOG_FILE = "CHANGELOG.md";
const CHANGELOG_HEADER = "# Changelog\n";

/** Inserts a new "## <tag>" section (newest first) right after the top-level heading. */
async function prependChangelogEntry(repoRoot: string, tag: string, messages: string[]): Promise<void> {
  const path = join(repoRoot, CHANGELOG_FILE);
  const existing = await exists(path, { isFile: true }) ? await Deno.readTextFile(path) : CHANGELOG_HEADER;
  const body = existing.startsWith(CHANGELOG_HEADER) ? existing.slice(CHANGELOG_HEADER.length) : existing;
  const list = messages.length > 0
    ? messages.map((m) => `- ${m}`).join("\n")
    : "- (no commits since the last release)";
  const entry = `\n## ${tag}\n\n${list}\n`;
  await Deno.writeTextFile(path, CHANGELOG_HEADER + entry + body);
}

export interface ReleaseFlags {
  dryRun?: boolean;
  preRelease?: string;
  meta?: string;
  /** Push the tag to this remote after creating it. Not pushed if unset. */
  remote?: string;
}

export interface ReleasePreview {
  tag: string;
  lastTag?: string;
  commitMessages: string[];
}

async function buildPreview(repoRoot: string, base: SemVer, flags: ReleaseFlags): Promise<ReleasePreview> {
  const last = await findLastTag(repoRoot);
  const version: SemVer = { ...base, preRelease: flags.preRelease, meta: flags.meta };
  const tag = formatTag(version);
  const commitMessages = await collectCommitMessages(repoRoot, last?.tag);
  return { tag, lastTag: last?.tag, commitMessages };
}

/**
 * Updates CHANGELOG.md, commits it as "release: <tag>", creates the tag on
 * that commit, and pushes the tag if a remote was given. The changelog
 * commit is intentionally separate from tag creation — releaseUndo only
 * removes the tag, never this commit.
 */
async function applyRelease(repoRoot: string, preview: ReleasePreview, flags: ReleaseFlags): Promise<void> {
  await prependChangelogEntry(repoRoot, preview.tag, preview.commitMessages);
  await $`git add ${CHANGELOG_FILE}`.cwd(repoRoot);
  await $`git commit -m ${`release: ${preview.tag}`}`.cwd(repoRoot);
  await $`git tag ${preview.tag}`.cwd(repoRoot);
  if (flags.remote) {
    await $`git push ${flags.remote} ${preview.tag}`.cwd(repoRoot);
  }
}

export type BumpKind = "major" | "minor" | "patch";

/** Bumps the version from the last tag per semver rules. No tags yet behaves as if the last tag were 0.0.0. */
export async function releaseNext(bump: BumpKind, flags: ReleaseFlags): Promise<ReleasePreview> {
  const repoRoot = await findRepoRoot();
  const last = await findLastTag(repoRoot);
  const base = last?.version ?? { major: 0, minor: 0, patch: 0 };
  const bumped: SemVer = bump === "major"
    ? { major: base.major + 1, minor: 0, patch: 0 }
    : bump === "minor"
    ? { major: base.major, minor: base.minor + 1, patch: 0 }
    : { major: base.major, minor: base.minor, patch: base.patch + 1 };

  const preview = await buildPreview(repoRoot, bumped, flags);
  if (!flags.dryRun) await applyRelease(repoRoot, preview, flags);
  return preview;
}

/** Sets an arbitrary version. Must be exactly "x.y.z" — use preRelease/meta flags for those suffixes. */
export async function releaseSet(version: string, flags: ReleaseFlags): Promise<ReleasePreview> {
  if (!BARE_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version "${version}" — expected the shape x.y.z (e.g. 1.2.3).`);
  }
  const repoRoot = await findRepoRoot();
  const [major, minor, patch] = version.split(".").map(Number);
  const preview = await buildPreview(repoRoot, { major, minor, patch }, flags);
  if (!flags.dryRun) await applyRelease(repoRoot, preview, flags);
  return preview;
}

export interface UndoFlags {
  dryRun?: boolean;
  remote?: string;
}

export interface UndoResult {
  tag: string;
  deletedFromRemote?: string;
}

/** Deletes only the last (highest-semver) tag — never touches any commit, including a changelog commit from a previous release. */
export async function releaseUndo(flags: UndoFlags): Promise<UndoResult> {
  const repoRoot = await findRepoRoot();
  const last = await findLastTag(repoRoot);
  if (!last) {
    throw new Error("No semver tags found to undo.");
  }
  if (flags.dryRun) {
    return { tag: last.tag, deletedFromRemote: flags.remote };
  }
  await $`git tag -d ${last.tag}`.cwd(repoRoot);
  if (flags.remote) {
    await $`git push ${flags.remote} --delete ${last.tag}`.cwd(repoRoot);
  }
  return { tag: last.tag, deletedFromRemote: flags.remote };
}
