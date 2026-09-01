import { join } from "@std/path";
import { exists } from "@std/fs";
import { Delegate, type Emitter } from "@duesabati/evento";
import type { EnsembleConfigStore } from "./config.ts";

export interface ArtifactDependenciesResolvedEvent {
  shipName: string;
  /** App names (a subset of what the kit was offered) it reported actually depending on. */
  artifacts: string[];
}

/**
 * Validates the artifact dependencies a pack kit reports using, and records
 * them against the ship they were packed for. A kit reporting a dependency on
 * an app with no build output is treated as a packaging error (the ship would
 * otherwise silently fall back to whatever a Dockerfile's --from name happens
 * to resolve to, e.g. a stale or unrelated image — see docker kit).
 */
export class ArtifactDependencyTracker {
  private readonly resolved = new Delegate<
    [ArtifactDependenciesResolvedEvent]
  >();

  get OnResolved(): Emitter<[ArtifactDependenciesResolvedEvent]> {
    return this.resolved;
  }

  constructor(
    private readonly artifactsDir: string,
    private readonly config: EnsembleConfigStore,
  ) {}

  /**
   * Throws if `artifacts` names an app with no build output under artifacts/.
   * Otherwise records the dependency list against `shipName` and fires
   * OnResolved once the write has completed.
   */
  async Resolve(shipName: string, artifacts: string[]): Promise<void> {
    for (const app of artifacts) {
      const root = join(this.artifactsDir, app);
      if (!await exists(root, { isDirectory: true })) {
        throw new Error(
          `Ship "${shipName}" depends on app "${app}", but it has no build output at ${root}. ` +
            `Run \`ens build ${app}\` first.`,
        );
      }
    }
    await this.config.setShipArtifacts(shipName, artifacts);
    this.resolved.Invoke({ shipName, artifacts });
  }
}
