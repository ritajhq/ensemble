import type { Ecosystem } from "./ecosystem/index.ts";
import type { LibDeclaration } from "./lib-declaration.ts";
import { LibKit } from "./lib-kit.ts";
import type { Ports } from "./ports.ts";
import {
  type Denial,
  denialFrom,
  type PublishCheck,
} from "./publish-authorization.ts";

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

  /** Has `ecosystem` move every discovered core library to `version` and repin whatever depends on one, then runs each library's lib kit stamp, ahead of the release commit that gets tagged — see `ReleaseCeremony.stampCoreLibs`. Returns every file the commit must name beyond the libraries' own directories. */
  async stamp(
    version: string,
    libs: readonly CoreLibRelease[],
    ecosystem: Pick<Ecosystem, "stamp" | "lockfiles">,
  ): Promise<string[]> {
    const repinned = await ecosystem.stamp(
      version,
      libs.map(({ libRoot, declaration }) => ({
        name: declaration.package,
        directory: libRoot,
      })),
    );
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
    return [...repinned, ...await ecosystem.lockfiles()];
  }

  /** Asks every discovered core library's declared lib kits whether this machine may publish it — all at once, each check being a read-only probe of its own destination — handing each outcome to `onChecked` as it arrives, and returning one `Denial` per refused entry: empty when everything is authorized. Runs before `stamp`. */
  async authorize(
    version: string,
    libs: readonly CoreLibRelease[],
    onChecked?: (check: PublishCheck) => void,
  ): Promise<Denial[]> {
    const checks = libs.flatMap(({ libRoot, declaration }) =>
      declaration.publish.map(async (entry): Promise<PublishCheck> => {
        const authorization = await this.libKitFor(entry.kit).authorize({
          libRoot,
          package: declaration.package,
          version,
          target: entry.target,
        });
        const check = {
          publish: `${declaration.package} → ${entry.kit}`,
          ...authorization,
        };
        onChecked?.(check);
        return check;
      })
    );
    return (await Promise.all(checks)).flatMap((check) =>
      denialFrom(check) ?? []
    );
  }

  async publish(
    version: string,
    libs: readonly CoreLibRelease[],
    onPublished?: (lib: CoreLibRelease) => void | Promise<void>,
  ): Promise<void> {
    for (const lib of libs) {
      const { libRoot, declaration } = lib;
      for (const entry of declaration.publish) {
        await this.libKitFor(entry.kit).publish({
          libRoot,
          package: declaration.package,
          version,
          target: entry.target,
        });
      }
      await onPublished?.(lib);
    }
  }
}
