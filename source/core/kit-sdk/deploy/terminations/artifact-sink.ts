import type { PresentedArtifact } from "../render/presented-artifact.ts";

/** Where a presented artifact's bytes actually go — an adapter (Section 4); `eject` and `apply` each use one. */
export interface ArtifactSink {
  write(artifact: PresentedArtifact): Promise<void>;
  /** The path `artifact` was (or would be) written to — `Applier` needs this to hand a real file path to the target's native apply command. */
  pathFor(artifact: PresentedArtifact): string;
}
