import type { LibDeclaration } from "./lib-declaration.ts";
import { LibKit } from "./lib-kit.ts";
import type { Ports } from "./ports.ts";

/** One core library discovered for a release run, alongside its declaration. */
export interface CoreLibRelease {
  readonly libRoot: string;
  readonly declaration: LibDeclaration;
}

/**
 * Publishes every discovered core library's declared `publish` entries under
 * the release ceremony's already-computed version — invoked alongside the
 * ship cascade, sharing its version, in `ReleaseCeremony`. Deliberately
 * never touches `SelfContainmentChecker`: core libraries are exempt from the
 * self-containment check entirely (Section 1), so this cascade has no
 * dependency on it at all, not even one it chooses not to call.
 */
export class CoreLibReleaseCascade {
  constructor(
    private readonly ports: Ports,
    private readonly libKitFor: (kit: string) => LibKit = (kit) =>
      new LibKit(kit, ports),
  ) {}

  /** Stamps every discovered core library's manifest with `version`, ahead of the release commit that gets tagged — see `ReleaseCeremony.stampCoreLibs`. */
  async stamp(
    version: string,
    libs: readonly CoreLibRelease[],
  ): Promise<void> {
    for (const { libRoot, declaration } of libs) {
      for (const entry of declaration.publish) {
        await this.libKitFor(entry.kit).stamp({
          libRoot,
          package: declaration.package,
          version,
          target: entry.target,
        });
      }
    }
  }

  async publish(
    version: string,
    libs: readonly CoreLibRelease[],
  ): Promise<void> {
    for (const { libRoot, declaration } of libs) {
      for (const entry of declaration.publish) {
        await this.libKitFor(entry.kit).publish({
          libRoot,
          package: declaration.package,
          version,
          target: entry.target,
        });
      }
    }
  }
}
