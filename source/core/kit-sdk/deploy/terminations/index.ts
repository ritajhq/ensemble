export type { ArtifactSink } from "./artifact-sink.ts";
export { FileArtifactSink } from "./file-artifact-sink.ts";
export type { DiffLine, DiffLineKind, IntentDiff } from "./intent-diff.ts";
export { IntentDiffer } from "./intent-diff.ts";
export type { Diff, DiffSource } from "./diff-source.ts";
export type { RenderCachePort } from "./render-cache.ts";
export { FileRenderCache } from "./file-render-cache.ts";
export { Ejector } from "./ejector.ts";
export { Planner } from "./planner.ts";
export { Applier, ApplyError } from "./applier.ts";
export {
  ReleaseAvailabilityError,
  ReleaseAvailabilityPreflight,
} from "./release-availability-preflight.ts";
export {
  CapabilityGapError,
  type CapabilityGapReport,
  DeploymentCoordinator,
  type DeployOptions,
  type DeployResult,
  type Termination,
} from "./deployment-coordinator.ts";
