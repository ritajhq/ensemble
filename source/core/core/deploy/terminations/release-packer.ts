import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Release } from "../release.ts";
import type { Workload } from "../workload.ts";

export class ReleasePackError extends Error {
  constructor(readonly releaseName: string, message: string) {
    super(message);
    this.name = "ReleasePackError";
  }
}

/**
 * Packs one release's artifact — the side-effecting counterpart
 * `PackKitGateway.describe`/`verify` don't perform (those only ask about a
 * release; this actually builds one). The concrete, subprocess-spawning
 * implementation lives in `@ensemble/core` (wrapping the existing
 * `runPack`), for the same reason `PackKitGateway`'s does: kit-sdk has no
 * dependency on it. Throws `ReleasePackError` on failure — a pack failure is
 * a real problem for the developer to fix, not a business outcome to report
 * and proceed past (unlike `ReleaseAvailability`'s `available: false`).
 */
export interface ReleasePacker {
  pack(releaseName: string, release: Release): Promise<void>;
}

/**
 * Section 7's terminal-path pack step: before a local-artifacts apply
 * proceeds, packs exactly the releases this workload's resources actually
 * reference — not every release declared in the manifest, and not more than
 * once each — so the local tag (`<outputName>:latest`) exists before the
 * kit's own apply/watch command runs. The dev loop's answer to "remember to
 * pack first." Symmetric to `ReleaseAvailabilityPreflight`, opposite
 * direction: that one verifies a remote artifact already exists; this one
 * produces a local one.
 */
export class LocalArtifactsPacker {
  constructor(private readonly packer: ReleasePacker) {}

  async packReferenced(
    workload: Workload,
    graph: DependencyGraph,
  ): Promise<void> {
    for (const name of this.referencedReleases(graph)) {
      const release = workload.release?.[name];
      if (!release) {
        // Unreachable once ReferenceValidator has run (it guarantees every
        // ${release.<name>} names a declared release) — guarded rather than
        // silently skipped, so a future change that reorders these checks
        // fails loudly instead of quietly under-packing.
        throw new Error(
          `Internal error: referenced release "${name}" not found in workload.`,
        );
      }
      await this.packer.pack(name, release);
    }
  }

  /** Every release name at least one resource in the graph actually depends on — not just every release the manifest declares. Reuses the already-built `DependencyGraph` rather than re-walking references. */
  private referencedReleases(graph: DependencyGraph): ReadonlySet<string> {
    const names = new Set<string>();
    for (const batch of graph.batches()) {
      for (const id of batch) {
        for (const dependency of graph.dependenciesOf(id)) {
          if (dependency.category === "release") names.add(dependency.name);
        }
      }
    }
    return names;
  }
}
