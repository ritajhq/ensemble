import { dirname, join } from "@std/path";
import { exists } from "@std/fs";

const REPO = "ritajhq/ensemble";
const ASSET_NAME = "ensemble-linux-x64";
const VERSION_MARKER = ".version";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  preRelease?: string;
}

const SEMVER_TAG_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersionTag(tag: string): SemVer | undefined {
  const match = SEMVER_TAG_PATTERN.exec(tag);
  if (!match) return undefined;
  const [, major, minor, patch, preRelease] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), preRelease };
}

/** Semver precedence: a pre-release has lower precedence than its associated normal version. */
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

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

async function listReleases(): Promise<{ tag: string; version: SemVer; assetUrl: string }[]> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: { Accept: "application/vnd.github+json", "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`Failed to list releases: ${response.status} ${response.statusText}`);
  }
  const releases = await response.json() as GithubRelease[];
  return releases
    .map((release) => {
      const version = parseVersionTag(release.tag_name);
      const asset = release.assets.find((a) => a.name === ASSET_NAME);
      if (!version || !asset) return undefined;
      return { tag: release.tag_name, version, assetUrl: asset.browser_download_url };
    })
    .filter((entry): entry is { tag: string; version: SemVer; assetUrl: string } => entry !== undefined);
}

/** Path to the currently running compiled `ens` binary. Throws if running under `deno run`/`deno task` instead of a compiled binary. */
function currentExecutablePath(): string {
  const path = Deno.execPath();
  if (path.endsWith("/deno") || path === "deno") {
    throw new Error(
      "version update/set only works for the compiled `ens` binary, not when running via `deno run`/`deno task`.",
    );
  }
  return path;
}

function versionMarkerPath(): string {
  return join(dirname(currentExecutablePath()), VERSION_MARKER);
}

/** The version recorded next to the running binary at install time, if any. */
export async function getInstalledVersion(): Promise<SemVer | undefined> {
  const markerPath = versionMarkerPath();
  if (!await exists(markerPath, { isFile: true })) return undefined;
  const tag = (await Deno.readTextFile(markerPath)).trim();
  return parseVersionTag(tag);
}

async function downloadAndInstall(tag: string, assetUrl: string): Promise<void> {
  const response = await fetch(assetUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${assetUrl}: ${response.status} ${response.statusText}`);
  }

  const execPath = currentExecutablePath();
  const tmpPath = `${execPath}.download`;
  const file = await Deno.open(tmpPath, { create: true, write: true, truncate: true, mode: 0o755 });
  try {
    await response.body.pipeTo(file.writable);
  } catch (error) {
    await Deno.remove(tmpPath).catch(() => {});
    throw error;
  }
  await Deno.chmod(tmpPath, 0o755);
  await Deno.rename(tmpPath, execPath);
  await Deno.writeTextFile(versionMarkerPath(), `${tag}\n`);
}

export type BumpKind = "major" | "minor" | "patch";

export interface InstallResult {
  tag: string;
  previous?: SemVer;
}

/**
 * Installs the newest release within the given bump's scope, relative to the
 * currently installed version: "patch" stays on the current major.minor line,
 * "minor" stays on the current major line, "major" allows any major.
 * No installed-version marker behaves as if the current version were 0.0.0.
 *
 * If the installed version has a pre-release suffix, the update stays on that
 * same pre-release channel (e.g. "alpha" -> "alpha"). Otherwise, only normal
 * (non-pre-release) releases are considered.
 */
export async function installNext(bump: BumpKind): Promise<InstallResult> {
  const current = await getInstalledVersion();
  const base = current ?? { major: 0, minor: 0, patch: 0 };

  const releases = await listReleases();
  const candidates = releases.filter(({ version }) => {
    if (version.preRelease !== base.preRelease) return false;
    if (compareSemVer(version, base) <= 0) return false;
    if (bump === "major") return true;
    if (bump === "minor") return version.major === base.major;
    return version.major === base.major && version.minor === base.minor;
  });

  if (candidates.length === 0) {
    throw new Error(
      `No newer release found for bump "${bump}"` +
        (current ? ` from the installed version ${current.major}.${current.minor}.${current.patch}.` : "."),
    );
  }

  const best = candidates.reduce((max, c) => (compareSemVer(c.version, max.version) > 0 ? c : max));
  await downloadAndInstall(best.tag, best.assetUrl);
  return { tag: best.tag, previous: current };
}

/** Installs a specific released version, if it exists. */
export async function installSet(version: string): Promise<InstallResult> {
  const current = await getInstalledVersion();
  const releases = await listReleases();
  const match = releases.find((r) => r.tag === version || r.tag === `v${version}`);
  if (!match) {
    throw new Error(`Release "${version}" not found (or has no "${ASSET_NAME}" asset).`);
  }
  await downloadAndInstall(match.tag, match.assetUrl);
  return { tag: match.tag, previous: current };
}
