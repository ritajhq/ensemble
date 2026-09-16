export interface Version {
  major: number;
  minor: number;
  patch: number;
}

function parse(raw: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!match) throw new Error(`Invalid version "${raw}", expected "x.y.z".`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compare(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function sameMajor(a: Version, b: Version): boolean {
  return a.major === b.major;
}

function sameMajorMinor(a: Version, b: Version): boolean {
  return a.major === b.major && a.minor === b.minor;
}

/**
 * True if `version` satisfies `range`. Supports the subset actually needed
 * for `kitSdk` compatibility checks — `"*"`, an exact `"x.y.z"`, `"^x.y.z"`
 * (same major, >=), `"~x.y.z"` (same major.minor, >=), and `">=x.y.z"` — not
 * a full semver-range engine (no OR ranges, no npm's 0.x caret narrowing).
 */
export function satisfies(version: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === "*") return true;

  const v = parse(version);

  if (trimmed.startsWith("^")) {
    const r = parse(trimmed.slice(1));
    return sameMajor(v, r) && compare(v, r) >= 0;
  }
  if (trimmed.startsWith("~")) {
    const r = parse(trimmed.slice(1));
    return sameMajorMinor(v, r) && compare(v, r) >= 0;
  }
  if (trimmed.startsWith(">=")) {
    const r = parse(trimmed.slice(2));
    return compare(v, r) >= 0;
  }

  return compare(v, parse(trimmed)) === 0;
}

/** Parses a git tag as a semver version — tolerant of a leading "v" (e.g. "v1.2.3"), unlike `satisfies`'s stricter range parsing. Returns `undefined` rather than throwing when `tag` isn't a plain "x.y.z" (no pre-release/meta support — kit tags aren't expected to need it). */
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
