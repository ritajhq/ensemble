import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { PresentedArtifact } from "../render/presented-artifact.ts";
import type { Kit } from "../kit/kit.ts";
import type { ArtifactSink } from "./artifact-sink.ts";

/**
 * `eject` (Section 9): render (already done by the caller), write the
 * artifact to the outputs dir, present it, stop. No side effects beyond that
 * one write — deliberately does not touch the render cache (`Planner`/
 * `Applier` do); eject is an inspection/export action, not a step in the
 * deploy loop.
 */
export class Ejector {
  constructor(private readonly sink: ArtifactSink) {}

  async eject(
    artifacts: Artifacts,
    graph: DependencyGraph,
    kit: Kit,
  ): Promise<PresentedArtifact> {
    const presented = kit.present(artifacts, graph);
    await this.sink.write(presented);
    return presented;
  }
}
