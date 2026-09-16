import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import * as KitSdk from "@ensemble/kit-sdk";
import { runPack } from "./pack.ts";
import { runPublish } from "./publish.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import {
  type CoreLibRelease,
  CoreLibReleaseCascade,
} from "./lib-release-cascade.ts";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  preRelease?: string;
  meta?: string;
}

const SEMVER_TAG_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const BARE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function parseSemVerTag(tag: string): SemVer | undefined {
  const match = SEMVER_TAG_PATTERN.exec(tag);
  if (!match) return undefined;
  const [, major, minor, patch, preRelease, meta] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    preRelease,
    meta,
  };
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
  if (aPre && bPre) {
    return a.preRelease! < b.preRelease!
      ? -1
      : a.preRelease! > b.preRelease!
      ? 1
      : 0;
  }
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
      .filter((entry): entry is { tag: string; version: SemVer } =>
        entry.version !== undefined
      );
  }

  /** The highest tag by semver precedence, not the most recently created one — tags don't have to be created in version order. */
  private async findLastTag(): Promise<
    { tag: string; version: SemVer } | undefined
  > {
    const tags = await this.listSemVerTags();
    if (tags.length === 0) return undefined;
    return tags.reduce((
      max,
      t,
    ) => (compareSemVer(t.version, max.version) > 0 ? t : max));
  }

  /** The highest tag by semver precedence on a given pre-release line (`preRelease` undefined means the stable line). */
  private async findLastTagOnLine(
    preRelease: string | undefined,
  ): Promise<{ tag: string; version: SemVer } | undefined> {
    const tags = (await this.listSemVerTags()).filter((t) =>
      t.version.preRelease === preRelease
    );
    if (tags.length === 0) return undefined;
    return tags.reduce((
      max,
      t,
    ) => (compareSemVer(t.version, max.version) > 0 ? t : max));
  }

  private async buildPreview(
    base: SemVer,
    flags: ReleaseFlags,
    last?: { tag: string; version: SemVer },
  ): Promise<ReleasePreview> {
    // "from" must be the tag this release is based on — the last tag on the
    // *same* pre-release line as the one being created — not the overall
    // highest tag. Otherwise bumping the stable line past a higher pre-release
    // tag (e.g. 0.0.11 while 1.0.10-alpha exists) reports a misleading "from".
    const resolvedLast = last ?? await this.findLastTagOnLine(flags.preRelease);
    const version: SemVer = {
      ...base,
      preRelease: flags.preRelease,
      meta: flags.meta,
    };
    const tag = formatTag(version);
    return { tag, lastTag: resolvedLast?.tag };
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

    return await this.buildPreview(bumped, flags, last);
  }

  /** Previews an arbitrary version. Must be exactly "x.y.z" — use preRelease/meta flags for those suffixes. Does not create the tag — call createReleaseTag separately once confirmed. */
  async set(version: string, flags: ReleaseFlags): Promise<ReleasePreview> {
    if (!BARE_VERSION_PATTERN.test(version)) {
      throw new Error(
        `Invalid version "${version}" — expected the shape x.y.z (e.g. 1.2.3).`,
      );
    }
    const [major, minor, patch] = version.split(".").map(Number);
    return await this.buildPreview({ major, minor, patch }, flags);
  }

  /** Creates the tag locally, once the caller has confirmed all prompts. Pushing is a separate, explicit step (see pushCommits/pushTag). */
  async createReleaseTag(preview: ReleasePreview): Promise<void> {
    await $`git tag ${preview.tag}`.cwd(this.repoRoot);
  }

  /** True if `tag` already exists locally — used by `ens release resume` to reject a tag that was never created. */
  async hasTag(tag: string): Promise<boolean> {
    const tags = await this.listSemVerTags();
    return tags.some((t) => t.tag === tag);
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

/** One ship's release recipe, collected from a workload's `release:` section — `declaredIn` names every workload that declares it identically (see `ReleaseCeremony.collectShipReleases`). */
export interface ShipRelease extends KitSdk.Deploy.Release {
  name: string;
  declaredIn: string[];
}

/** Thrown when the same ship name is declared with conflicting options across more than one workload's `release:` section. */
export class ReleaseConflictError extends Error {}

function releaseEntriesEqual(
  a: KitSdk.Deploy.Release,
  b: KitSdk.Deploy.Release,
): boolean {
  return a.kit === b.kit && a.mode === b.mode &&
    a.outputName === b.outputName &&
    a.publish?.target === b.publish?.target &&
    a.publish?.name === b.publish?.name &&
    publishOptionsEqual(a.publish?.options, b.publish?.options);
}

function publishOptionsEqual(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a![key] === b?.[key]);
}

/**
 * Cycles through every workload's `release:` section to actually build, pack,
 * publish, and changelog a version — the part of the release ceremony
 * `ReleaseService` doesn't do (it only handles the git-tag half). Kept as a
 * separate class from `ReleaseService`: tagging is pure git-plumbing, this is
 * cross-cutting orchestration over workloads/build/pack/publish — different
 * reasons to change.
 */
export class ReleaseCeremony {
  constructor(private readonly repoRoot: string) {}

  /**
   * Globs every `ci/<name>/delivery.yml`, collects each one's `release:`
   * section, and deduplicates by ship name: identical declarations (same
   * kit/mode/outputName/publish) across manifests collapse into one
   * `ShipRelease`; the same name declared with *conflicting* options throws
   * `ReleaseConflictError` rather than silently picking one.
   */
  async collectShipReleases(): Promise<ShipRelease[]> {
    const ciDir = join(this.repoRoot, "ci");
    const byName = new Map<string, ShipRelease>();

    if (!await exists(ciDir, { isDirectory: true })) return [];

    for await (const dirEntry of Deno.readDir(ciDir)) {
      if (!dirEntry.isDirectory) continue;
      const workloadPath = join(ciDir, dirEntry.name, "delivery.yml");
      if (!await exists(workloadPath, { isFile: true })) continue;

      const loader = new KitSdk.Deploy.Manifest.Loader(
        new KitSdk.Deploy.Manifest.Parser(),
      );
      const workload = await loader.loadFile(workloadPath);
      for (
        const [shipName, release] of Object.entries(workload.release ?? {})
      ) {
        const existing = byName.get(shipName);
        if (!existing) {
          byName.set(shipName, {
            ...release,
            name: shipName,
            declaredIn: [dirEntry.name],
          });
          continue;
        }
        if (!releaseEntriesEqual(existing, release)) {
          throw new ReleaseConflictError(
            `release "${shipName}" is declared differently in ${
              existing.declaredIn.join(", ")
            } and ${dirEntry.name} — reconcile them before releasing.`,
          );
        }
        existing.declaredIn.push(dirEntry.name);
      }
    }

    return [...byName.values()];
  }

  /** Discovers every `source/core/<name>/lib.yml` — the core-lib half of the same discovery step, run alongside `collectShipReleases` (Section 9 of the vendoring build plan: core libraries publish via this cascade, never `ens lib publish`). */
  async collectCoreLibReleases(): Promise<CoreLibRelease[]> {
    return await new LibDeclarationLoader(this.repoRoot).discoverCoreLibs();
  }

  /**
   * Publishes every discovered core library's declared `publish` entries
   * under `version` — the same version `publishShips` stamps ships with in
   * the same run. Never runs `SelfContainmentChecker`: core libraries are
   * exempt from that check entirely.
   */
  async releaseCoreLibs(
    libs: readonly CoreLibRelease[],
    version: string,
  ): Promise<void> {
    await new CoreLibReleaseCascade().cascade(version, libs);
  }

  /**
   * Packs every ship (which itself builds whatever apps it actually depends
   * on first — see `runPack`). Stops at the first failure. Kept separate from
   * `publishShips` so a caller can pack everything before publishing
   * anything — packing is local and repeatable, publishing usually isn't, so
   * a late pack failure shouldn't be discovered after an earlier ship has
   * already been published.
   */
  async packShips(ships: readonly ShipRelease[]): Promise<void> {
    for (const ship of ships) {
      const packCode = await runPack(ship.name, ship.kit, {
        mode: ship.mode,
        outputName: ship.outputName,
      });
      if (packCode !== 0) {
        throw new Error(
          `Packing ship "${ship.name}" failed with code ${packCode}.`,
        );
      }
    }
  }

  /** Publishes every ship that declares a `publish` target, under `version`. Assumes `packShips` has already succeeded for all of them. Stops at the first failure. */
  async publishShips(
    ships: readonly ShipRelease[],
    version: string,
  ): Promise<void> {
    for (const ship of ships) {
      if (!ship.publish) continue;
      const publishCode = await runPublish(ship.name, ship.kit, {
        target: ship.publish.target,
        packageName: ship.publish.name,
        options: ship.publish.options,
        outputName: ship.outputName,
        version,
      });
      if (publishCode !== 0) {
        throw new Error(
          `Publishing ship "${ship.name}" failed with code ${publishCode}.`,
        );
      }
    }
  }
}
