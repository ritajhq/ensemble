import * as KitSdk from "@ensemble/kit-sdk";
import { runPack } from "./pack.ts";

/**
 * The real `ReleasePacker`: wraps the existing `runPack` (the same
 * entrypoint `ens pack` and the release ceremony use) — no new packing
 * logic, just orchestrating it over the releases a local-artifacts deploy
 * actually references. Lives here rather than in kit-sdk for the same
 * reason `SubprocessPackKitGateway` does: `runPack` needs `@david/dax` and
 * repo/config-file access, which kit-sdk can't depend on.
 */
export class RunPackReleasePacker
  implements KitSdk.Deploy.Terminations.ReleasePacker {
  /**
   * `skipBuildingApps`: apps this packer should never build itself, because
   * a caller-owned companion process already keeps them fresh (e.g. `ens
   * develop`'s `ens build --watch` loop over `development.sync` apps) —
   * building them here too would race that long-lived watch build over the
   * same output directory. Defaults to none.
   */
  constructor(
    private readonly skipBuildingApps: ReadonlySet<string> = new Set(),
  ) {}

  async pack(
    releaseName: string,
    release: KitSdk.Deploy.Release,
  ): Promise<void> {
    const code = await runPack(releaseName, release.kit, {
      mode: release.mode,
      outputName: release.outputName,
      skipBuildingApps: this.skipBuildingApps,
    });
    if (code !== 0) {
      throw new KitSdk.Deploy.Terminations.ReleasePackError(
        releaseName,
        `Packing release "${releaseName}" with kit "${release.kit}" failed (exit code ${code}).`,
      );
    }
  }
}
