import { dirname, join } from "@std/path";
import { exists } from "@std/fs";
import { Delegate, type Emitter } from "@duesabati/evento";

const REPO = "ritajhq/ensemble";
const ASSET_NAME = "ensemble-linux-x64";
/** Gzipped copy of ASSET_NAME, published alongside it from 0.45.0 on — preferred when present (~3x smaller download). */
const COMPRESSED_ASSET_NAME = `${ASSET_NAME}.gz`;
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

export function formatVersionTag(version: SemVer): string {
  return `${version.major}.${version.minor}.${version.patch}${version.preRelease ? `-${version.preRelease}` : ""}`;
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

export type BumpKind = "major" | "minor" | "patch";

export interface InstallResult {
  tag: string;
  previous?: SemVer;
  /** False when the requested release was already installed and nothing was downloaded. */
  changed: boolean;
}

interface ReleaseAsset {
  tag: string;
  version: SemVer;
  assetUrl: string;
  /** Whether assetUrl points at the gzipped asset and must be decompressed on the way to disk. */
  compressed: boolean;
}

/**
 * Checks for and installs updates to the currently running compiled `ens`
 * binary — resolves the binary's own path and version marker lazily on each
 * call rather than threading them through free functions.
 */
export class SelfUpdateService {
  private readonly downloadStart = new Delegate<[string, number | undefined]>();
  private readonly downloadProgress = new Delegate<[number, number | undefined]>();

  /** Fires with the release tag and total size in bytes (undefined if the server didn't say) right before the binary download begins. */
  get OnDownloadStart(): Emitter<[string, number | undefined]> {
    return this.downloadStart;
  }

  /** Fires with bytes received so far and the total size (if known) as each chunk of the binary arrives. */
  get OnDownloadProgress(): Emitter<[number, number | undefined]> {
    return this.downloadProgress;
  }

  private async fetchGithub(path: string): Promise<Response> {
    return await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
      headers: { Accept: "application/vnd.github+json", "Cache-Control": "no-cache" },
    });
  }

  private toReleaseAsset(release: GithubRelease): ReleaseAsset | undefined {
    const version = parseVersionTag(release.tag_name);
    if (!version) return undefined;
    const compressed = release.assets.find((a) => a.name === COMPRESSED_ASSET_NAME);
    if (compressed) {
      return { tag: release.tag_name, version, assetUrl: compressed.browser_download_url, compressed: true };
    }
    const raw = release.assets.find((a) => a.name === ASSET_NAME);
    if (!raw) return undefined;
    return { tag: release.tag_name, version, assetUrl: raw.browser_download_url, compressed: false };
  }

  private async listReleases(): Promise<ReleaseAsset[]> {
    const response = await this.fetchGithub("releases?per_page=100");
    if (!response.ok) {
      throw new Error(`Failed to list releases: ${response.status} ${response.statusText}`);
    }
    const releases = await response.json() as GithubRelease[];
    return releases
      .map((release) => this.toReleaseAsset(release))
      .filter((entry): entry is ReleaseAsset => entry !== undefined);
  }

  /** Looks up a single release by tag — a few KB, versus listing every release. */
  private async findRelease(tag: string): Promise<ReleaseAsset | undefined> {
    const response = await this.fetchGithub(`releases/tags/${encodeURIComponent(tag)}`);
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Failed to look up release ${tag}: ${response.status} ${response.statusText}`);
    }
    return this.toReleaseAsset(await response.json() as GithubRelease);
  }

  /** Whether we're running as a compiled `ens` binary, as opposed to under `deno run`/`deno task`. */
  private isCompiledBinary(): boolean {
    const path = Deno.execPath();
    return path !== "deno" && !path.endsWith("/deno");
  }

  /** Path to the currently running compiled `ens` binary. Throws if running under `deno run`/`deno task` instead of a compiled binary. */
  private currentExecutablePath(): string {
    if (!this.isCompiledBinary()) {
      throw new Error(
        "version update/set only works for the compiled `ens` binary, not when running via `deno run`/`deno task`.",
      );
    }
    return Deno.execPath();
  }

  private versionMarkerPath(): string {
    return join(dirname(this.currentExecutablePath()), VERSION_MARKER);
  }

  /**
   * The version recorded next to the running binary at install time, if any.
   * `undefined` both when there's no marker file and when there's no
   * installed-binary concept to begin with (running under `deno run`/`deno task`) —
   * this is a display/lookup path, not a mutating one, so it stays quiet rather
   * than throwing currentExecutablePath's compiled-binary-only error.
   */
  async getInstalledVersion(): Promise<SemVer | undefined> {
    if (!this.isCompiledBinary()) return undefined;
    const markerPath = this.versionMarkerPath();
    if (!await exists(markerPath, { isFile: true })) return undefined;
    const tag = (await Deno.readTextFile(markerPath)).trim();
    return parseVersionTag(tag);
  }

  private async downloadAndInstall({ tag, assetUrl, compressed }: ReleaseAsset): Promise<void> {
    const response = await fetch(assetUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${assetUrl}: ${response.status} ${response.statusText}`);
    }

    const execPath = this.currentExecutablePath();
    const tmpPath = `${execPath}.download`;
    const lengthHeader = Number(response.headers.get("content-length"));
    const total = lengthHeader > 0 ? lengthHeader : undefined;
    this.downloadStart.Invoke(tag, total);

    let received = 0;
    const progress = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform: (chunk, controller) => {
        received += chunk.byteLength;
        this.downloadProgress.Invoke(received, total);
        controller.enqueue(chunk);
      },
    });

    const file = await Deno.open(tmpPath, { create: true, write: true, truncate: true, mode: 0o755 });
    try {
      // Progress counts bytes off the wire, so it's measured before decompression to match content-length.
      const downloaded = response.body.pipeThrough(progress);
      const binary = compressed ? downloaded.pipeThrough(new DecompressionStream("gzip")) : downloaded;
      await binary.pipeTo(file.writable);
    } catch (error) {
      await Deno.remove(tmpPath).catch(() => {});
      throw error;
    }
    await Deno.chmod(tmpPath, 0o755);
    await Deno.rename(tmpPath, execPath);
    await Deno.writeTextFile(this.versionMarkerPath(), `${tag}\n`);
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
  async installNext(bump: BumpKind): Promise<InstallResult> {
    const current = await this.getInstalledVersion();
    const base = current ?? { major: 0, minor: 0, patch: 0 };

    const releases = await this.listReleases();
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

    const best = this.newest(candidates);
    await this.downloadAndInstall(best);
    return { tag: best.tag, previous: current, changed: true };
  }

  /**
   * Installs the newest release there is, whatever bump that takes — on the
   * installed version's channel, like `installNext` (a pre-release stays on
   * its own pre-release tag; otherwise only normal releases count). Already
   * on it, or on something newer than any release, installs nothing: never a
   * downgrade.
   */
  async installLatest(): Promise<InstallResult> {
    const current = await this.getInstalledVersion();
    const channel = (await this.listReleases()).filter(({ version }) =>
      version.preRelease === current?.preRelease
    );
    if (channel.length === 0) {
      throw new Error(
        current?.preRelease ? `No "${current.preRelease}" release found.` : "No release found.",
      );
    }

    const latest = this.newest(channel);
    if (current && compareSemVer(latest.version, current) <= 0) {
      return { tag: formatVersionTag(current), previous: current, changed: false };
    }
    await this.downloadAndInstall(latest);
    return { tag: latest.tag, previous: current, changed: true };
  }

  private newest(releases: readonly ReleaseAsset[]): ReleaseAsset {
    return releases.reduce((max, c) => (compareSemVer(c.version, max.version) > 0 ? c : max));
  }

  /** Installs a specific released version, if it exists. */
  async installSet(version: string): Promise<InstallResult> {
    const current = await this.getInstalledVersion();
    const match = await this.findRelease(version) ?? await this.findRelease(`v${version}`);
    if (!match) {
      throw new Error(`Release "${version}" not found (or has no "${ASSET_NAME}" asset).`);
    }
    if (current && compareSemVer(current, match.version) === 0) {
      return { tag: match.tag, previous: current, changed: false };
    }
    await this.downloadAndInstall(match);
    return { tag: match.tag, previous: current, changed: true };
  }
}
