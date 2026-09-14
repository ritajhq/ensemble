import type { ArtifactsSource } from "../artifacts-source.ts";
import type { Workload } from "../workload.ts";

/** Where a released ship's artifact actually is, in the target's own terms (Section 4) — a real reference string (an image tag, a download URL, a path) whose format is entirely owned by the pack kit that produced it. Deploy never interprets or categorizes this string — only embeds it. */
export interface ArtifactLocator {
  readonly ref: string;
}

/**
 * Given a release name and artifacts source, returns where its artifact is —
 * the seam that lets a compute reference a release (`${release.<name>}`) and
 * render *now*, without ens knowing anything about how pack kits actually
 * work.
 */
export interface ReleaseLocatorPort {
  locate(releaseName: string, artifacts: ArtifactsSource): ArtifactLocator;
}

export class UnknownReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownReleaseError";
  }
}

/**
 * A stub `ReleaseLocatorPort` backed by static, artifacts-source-keyed
 * config — Appendix A's own compose golden resolves a release to a local tag
 * and its aws golden to a published reference, so the stub needs both maps,
 * not just one. Each kit supplies its own config here; there is no real
 * pack-kit integration behind this.
 */
export class StubReleaseLocator implements ReleaseLocatorPort {
  constructor(
    private readonly locators: {
      readonly local: Readonly<Record<string, ArtifactLocator>>;
      readonly published: Readonly<Record<string, ArtifactLocator>>;
    },
  ) {}

  locate(releaseName: string, artifacts: ArtifactsSource): ArtifactLocator {
    const locator = this.locators[artifacts][releaseName];
    if (!locator) {
      throw new UnknownReleaseError(
        `No ${artifacts} locator configured for release "${releaseName}".`,
      );
    }
    return locator;
  }
}

/**
 * A non-stub `ReleaseLocatorPort`, but still short of "real pack-kit wiring"
 * (the output-kind compatibility check doesn't exist here either): derives an
 * image reference purely from the workload's own declared `release:` entry
 * and a version string, with no check that the image actually exists (G3 —
 * no provider reads, and packing an image isn't a provider read anyway, just
 * a local convention). For `local` artifacts this is the tag `ens pack`/
 * `ens develop` would have produced locally (`<outputName ?? name>:latest`);
 * for `published` it's the published reference (`publish.name ?? outputName
 * ?? name`) at the given version — the same publisher/deployer convention
 * `ens release` already uses (`ci/release.ts`'s `ShipRelease`), just read
 * from the other side.
 */
export class WorkloadReleaseLocator implements ReleaseLocatorPort {
  constructor(
    private readonly workload: Workload,
    private readonly version: string,
  ) {}

  locate(releaseName: string, artifacts: ArtifactsSource): ArtifactLocator {
    const release = this.workload.release?.[releaseName];
    if (!release) {
      throw new UnknownReleaseError(
        `No release named "${releaseName}" is declared in this workload.`,
      );
    }

    const outputName = release.outputName ?? releaseName;
    const ref = artifacts === "local"
      ? `${outputName}:latest`
      : `${release.publish?.name ?? outputName}:${this.version}`;
    return { ref };
  }
}

/**
 * A `ReleaseLocatorPort` backed by a locator map resolved ahead of time —
 * the synchronous counterpart `Renderer` needs, since its render pass is
 * pure and can't itself await a pack kit subprocess. `ReleaseLocatorResolver`
 * builds the map once per deploy by asking each release's actual pack kit
 * (already scoped to one artifacts source); this just serves it back by name
 * during render.
 */
export class PreresolvedReleaseLocator implements ReleaseLocatorPort {
  constructor(
    private readonly locators: ReadonlyMap<string, ArtifactLocator>,
  ) {}

  locate(releaseName: string): ArtifactLocator {
    const locator = this.locators.get(releaseName);
    if (!locator) {
      throw new UnknownReleaseError(
        `No locator resolved for release "${releaseName}".`,
      );
    }
    return locator;
  }
}
