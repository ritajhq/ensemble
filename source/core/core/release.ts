import { $ } from "@david/dax";

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

export interface ReleaseFlags {
  dryRun?: boolean;
  preRelease?: string;
  meta?: string;
}

export interface ReleasePreview {
  tag: string;
  lastTag?: string;
}

export type BumpKind = "major" | "minor" | "patch";

export interface UndoFlags {
  dryRun?: boolean;
}

export interface UndoResult {
  tag: string;
}

/**
 * Semver release-tag operations (preview/create/push/undo) against one repo —
 * constructed once with `repoRoot` so it doesn't need re-resolving on every call.
 */
export class ReleaseService {
  constructor(private readonly repoRoot: string) {}

  private async listSemVerTags(): Promise<{ tag: string; version: SemVer }[]> {
    const output = await $`git tag --list`.cwd(this.repoRoot).text();
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((tag) => ({ tag, version: parseSemVerTag(tag) }))
      .filter((entry): entry is { tag: string; version: SemVer } => entry.version !== undefined);
  }

  /** The highest tag by semver precedence, not the most recently created one — tags don't have to be created in version order. */
  private async findLastTag(): Promise<{ tag: string; version: SemVer } | undefined> {
    const tags = await this.listSemVerTags();
    if (tags.length === 0) return undefined;
    return tags.reduce((max, t) => (compareSemVer(t.version, max.version) > 0 ? t : max));
  }

  /** The highest tag by semver precedence on a given pre-release line (`preRelease` undefined means the stable line). */
  private async findLastTagOnLine(preRelease: string | undefined): Promise<{ tag: string; version: SemVer } | undefined> {
    const tags = (await this.listSemVerTags()).filter((t) => t.version.preRelease === preRelease);
    if (tags.length === 0) return undefined;
    return tags.reduce((max, t) => (compareSemVer(t.version, max.version) > 0 ? t : max));
  }

  private async buildPreview(base: SemVer, flags: ReleaseFlags): Promise<ReleasePreview> {
    const last = await this.findLastTag();
    const version: SemVer = { ...base, preRelease: flags.preRelease, meta: flags.meta };
    const tag = formatTag(version);
    return { tag, lastTag: last?.tag };
  }

  /** True if the working tree has uncommitted changes (staged, unstaged, or untracked). */
  async hasUncommittedChanges(): Promise<boolean> {
    const output = await $`git status --porcelain`.cwd(this.repoRoot).text();
    return output.trim().length > 0;
  }

  /** Pushes the current branch's commits to the given remote. */
  async pushCommits(remote: string): Promise<void> {
    await $`git push ${remote} HEAD`.cwd(this.repoRoot);
  }

  /** Pushes a single tag to the given remote. */
  async pushTag(tag: string, remote: string): Promise<void> {
    await $`git push ${remote} ${tag}`.cwd(this.repoRoot);
  }

  /** Deletes a tag from the given remote. */
  async deleteRemoteTag(tag: string, remote: string): Promise<void> {
    await $`git push ${remote} --delete ${tag}`.cwd(this.repoRoot);
  }

  /**
   * Previews the version bump from the last tag per semver rules. No tags yet behaves as if the last tag were 0.0.0.
   * Bumps within the target pre-release line: with `-p <suffix>`, from the last tag on that suffix's line; without
   * it, from the last stable (non-pre-release) tag, ignoring pre-release tags entirely.
   * Does not create the tag — call createReleaseTag separately once confirmed.
   */
  async next(bump: BumpKind, flags: ReleaseFlags): Promise<ReleasePreview> {
    const last = await this.findLastTagOnLine(flags.preRelease);
    const base = last?.version ?? { major: 0, minor: 0, patch: 0 };
    const bumped: SemVer = bump === "major"
      ? { major: base.major + 1, minor: 0, patch: 0 }
      : bump === "minor"
      ? { major: base.major, minor: base.minor + 1, patch: 0 }
      : { major: base.major, minor: base.minor, patch: base.patch + 1 };

    return await this.buildPreview(bumped, flags);
  }

  /** Previews an arbitrary version. Must be exactly "x.y.z" — use preRelease/meta flags for those suffixes. Does not create the tag — call createReleaseTag separately once confirmed. */
  async set(version: string, flags: ReleaseFlags): Promise<ReleasePreview> {
    if (!BARE_VERSION_PATTERN.test(version)) {
      throw new Error(`Invalid version "${version}" — expected the shape x.y.z (e.g. 1.2.3).`);
    }
    const [major, minor, patch] = version.split(".").map(Number);
    return await this.buildPreview({ major, minor, patch }, flags);
  }

  /** Creates the tag locally, once the caller has confirmed all prompts. Pushing is a separate, explicit step (see pushCommits/pushTag). */
  async createReleaseTag(preview: ReleasePreview): Promise<void> {
    await $`git tag ${preview.tag}`.cwd(this.repoRoot);
  }

  /** Deletes only the last (highest-semver) tag locally — never touches any commit. Deleting from a remote is a separate, explicit step (see deleteRemoteTag). */
  async undo(flags: UndoFlags): Promise<UndoResult> {
    const last = await this.findLastTag();
    if (!last) {
      throw new Error("No semver tags found to undo.");
    }
    if (flags.dryRun) {
      return { tag: last.tag };
    }
    await $`git tag -d ${last.tag}`.cwd(this.repoRoot);
    return { tag: last.tag };
  }
}
