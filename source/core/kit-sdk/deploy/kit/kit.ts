import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { PresentedArtifact } from "../render/presented-artifact.ts";
import type { ProvisionerSet } from "./provisioner.ts";
import type { Realization } from "./realization.ts";

/**
 * A target backend (compose, aws, k8s) — an adapter, one per target.
 * `present` and `applyCommand` are the two places target-specific knowledge
 * that Section 10 assigns to "a kit that emits artifacts" actually lives:
 * assembling+serializing `Artifacts` into one named, byte-ready document
 * (`present`), and knowing the target's own native apply invocation
 * (`applyCommand`, e.g. `docker compose -f <path> up -d`) — so the core's
 * `Ejector`/`Planner`/`Applier` (Phase 6) can stay target-agnostic.
 */
export interface Kit {
  provisioners(): ProvisionerSet;
  realization(): Realization;
  present(artifacts: Artifacts, graph: DependencyGraph): PresentedArtifact;
  /**
   * The argv to run against `artifactPath` (the file `present`'s output was
   * written to) to actually apply it — `["docker", "compose", "-f",
   * artifactPath, "-p", name, "up", "-d"]` for compose. `name` is the
   * deployment's own name (`ens deploy <name> <kit>`) — every target needs
   * *some* stable identifier to scope a deployment by (a compose project
   * name, a CloudFormation stack name), and it's the one identity that's
   * already guaranteed unique and stable across runs, so kits use it rather
   * than inventing their own.
   */
  applyCommand(artifactPath: string, name: string): readonly string[];
  /**
   * The argv for a long-lived watch command over `artifactPath`, mirroring
   * `applyCommand` — `["docker", "compose", "-f", artifactPath, "-p", name,
   * "watch"]` for compose. Optional, and `undefined` is a legitimate answer
   * (not an error): a kit/target with no native watch tool — aws today —
   * simply doesn't implement this, which the watch terminal step reads as a
   * capability gap rather than a bug.
   */
  watchCommand?(
    artifactPath: string,
    name: string,
  ): readonly string[] | undefined;
}
