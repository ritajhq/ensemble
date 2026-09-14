import type { Mode } from "../mode.ts";
import type { Workload } from "../workload.ts";

export type ArtifactKind = "image" | "archive" | "executable";

/** Where a released ship's artifact actually is, in the target's own terms (Section 4) — a docker image reference, an uploaded archive, a compiled executable path. */
export interface ArtifactLocator {
  readonly kind: ArtifactKind;
  readonly ref: string;
}

/**
 * Given a release name and mode, returns where its artifact is — the seam
 * that lets a compute reference a release (`${release.<name>.image}`) and
 * render *now*, without ens knowing anything about how pack kits actually
 * work (Section 12, reserved: "real pack-kit wiring... come later").
 */
export interface ReleaseLocatorPort {
  locate(releaseName: string, mode: Mode): ArtifactLocator;
}

export class UnknownReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownReleaseError";
  }
}

/**
 * A stub `ReleaseLocatorPort` backed by static, mode-keyed config — Appendix
 * A's own compose golden resolves a release to a local tag in development
 * mode and its aws golden to a published reference in production mode, so
 * the stub needs both maps, not just one. Each kit (Phase 5/7) supplies its
 * own config here; there is no real pack-kit integration behind this yet.
 */
export class StubReleaseLocator implements ReleaseLocatorPort {
  constructor(
    private readonly locators: {
      readonly development: Readonly<Record<string, ArtifactLocator>>;
      readonly production: Readonly<Record<string, ArtifactLocator>>;
    },
  ) {}

  locate(releaseName: string, mode: Mode): ArtifactLocator {
    const locator = this.locators[mode][releaseName];
    if (!locator) {
      throw new UnknownReleaseError(
        `No ${mode} locator configured for release "${releaseName}".`,
      );
    }
    return locator;
  }
}

/**
 * A non-stub `ReleaseLocatorPort`, but still short of "real pack-kit wiring"
 * (Section 12 reserves that, along with the output-kind compatibility check —
 * neither exists here): derives an image reference purely from the
 * workload's own declared `release:` entry and a version string, with no
 * check that the image actually exists (G3 — no provider reads, and packing
 * an image isn't a provider read anyway, just a local convention). In
 * `development` mode this is the tag `ens pack`/`ens develop` would have
 * produced locally (`<outputName ?? name>:latest`); in `production` mode it's
 * the published reference (`publish.name ?? outputName ?? name`) at the
 * given version — the same publisher/deployer convention `ens release`
 * already uses (`ci/release.ts`'s `ShipRelease`), just read from the other
 * side.
 */
export class WorkloadReleaseLocator implements ReleaseLocatorPort {
  constructor(
    private readonly workload: Workload,
    private readonly version: string,
  ) {}

  locate(releaseName: string, mode: Mode): ArtifactLocator {
    const release = this.workload.release?.[releaseName];
    if (!release) {
      throw new UnknownReleaseError(
        `No release named "${releaseName}" is declared in this workload.`,
      );
    }

    const outputName = release.outputName ?? releaseName;
    const ref = mode === "development"
      ? `${outputName}:latest`
      : `${release.publish?.name ?? outputName}:${this.version}`;
    return { kind: "image", ref };
  }
}
