export interface Version {
  major: number;
  minor: number;
  patch: number;
}

/** Parses a git tag as a semver version — tolerant of a leading "v" (e.g. "v1.2.3"). Returns `undefined` rather than throwing when `tag` isn't a plain "x.y.z" (no pre-release/meta support — kit tags aren't expected to need it). */
export function parseTag(tag: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Formats a version as a bare "x.y.z" tag, with a leading "v" only if `likeTag` had one — so bumping "v1.2.3" yields "v1.2.4", not "1.2.4". */
export function formatTag(version: Version, likeTag: string): string {
  const prefix = /^v/i.test(likeTag.trim()) ? "v" : "";
  return `${prefix}${version.major}.${version.minor}.${version.patch}`;
}

export type BumpKind = "major" | "minor" | "patch";

/** The next version along `kind`'s line — same bump arithmetic `ReleaseService.next` uses for release tags (kept as its own small copy here rather than reaching into `release.ts`'s private functions; a later pass can check whether the two are worth sharing). */
export function bump(base: Version, kind: BumpKind): Version {
  if (kind === "major") return { major: base.major + 1, minor: 0, patch: 0 };
  if (kind === "minor") {
    return { major: base.major, minor: base.minor + 1, patch: 0 };
  }
  return { major: base.major, minor: base.minor, patch: base.patch + 1 };
}
