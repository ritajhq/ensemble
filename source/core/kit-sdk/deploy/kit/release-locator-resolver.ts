import type { Mode } from "../mode.ts";
import type { Workload } from "../workload.ts";
import type { PackKitGateway } from "./pack-kit-gateway.ts";
import type { ArtifactLocator } from "./release-locator.ts";

/**
 * Resolves every release a workload declares to its real `ArtifactLocator`
 * by asking each one's pack kit, once per deploy — the async, I/O-performing
 * counterpart to `ReleaseLocatorPort`'s synchronous lookups. `Renderer`'s
 * render pass is pure and can't itself await a subprocess, so this runs
 * ahead of it; its result then backs a `PreresolvedReleaseLocator` for the
 * render pass to consult.
 */
export class ReleaseLocatorResolver {
  constructor(private readonly gateway: PackKitGateway) {}

  async resolveAll(
    workload: Workload,
    mode: Mode,
    version: string,
  ): Promise<ReadonlyMap<string, ArtifactLocator>> {
    const resolved = new Map<string, ArtifactLocator>();
    for (const [name, release] of Object.entries(workload.release ?? {})) {
      const ref = await this.gateway.describe(name, release, mode, version);
      resolved.set(name, { ref });
    }
    return resolved;
  }
}
