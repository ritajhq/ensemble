import * as Deploy from "./deploy/index.ts";
import { runPack } from "./pack.ts";
import type { Ports } from "./ports.ts";

/**
 * The real `ReleasePacker`: wraps the existing `runPack` (the same
 * entrypoint `ens pack` and the release ceremony use) — no new packing
 * logic, just orchestrating it over the releases a local-artifacts deploy
 * actually references. Lives here rather than in kit-sdk for the same
 * reason `SubprocessPackKitGateway` does: `runPack` needs `@david/dax` and
 * repo/config-file access, which kit-sdk can't depend on.
 */
export class RunPackReleasePacker
  implements Deploy.Terminations.ReleasePacker {
  /**
   * `skipBuildingApps`: apps this packer should never build itself, because
   * a caller-owned companion process already keeps them fresh (e.g. `ens
   * develop`'s `ens build --watch` loop over `development.sync` apps) —
   * building them here too would race that long-lived watch build over the
   * same output directory. Defaults to none.
   */
  constructor(
    private readonly ports: Ports,
    private readonly skipBuildingApps: ReadonlySet<string> = new Set(),
    private readonly verbose = false,
  ) {}

  async pack(
    releaseName: string,
    release: Deploy.Release,
  ): Promise<void> {
    const code = await runPack(releaseName, release.kit, {
      mode: release.mode,
      outputName: release.outputName,
      skipBuildingApps: this.skipBuildingApps,
      verbose: this.verbose,
    }, this.ports);
    if (code !== 0) {
      throw new Deploy.Terminations.ReleasePackError(
        releaseName,
        `Packing release "${releaseName}" with kit "${release.kit}" failed (exit code ${code}).`,
      );
    }
  }
}
