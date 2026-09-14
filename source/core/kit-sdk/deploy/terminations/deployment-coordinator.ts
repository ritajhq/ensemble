import type { Workload } from "../workload.ts";
import type { Target } from "../kit/target.ts";
import type { ArtifactsSource } from "../artifacts-source.ts";
import type { ContractRegistry } from "../contracts/registry.ts";
import { ReferenceValidator } from "../contracts/reference-validator.ts";
import { DependencyGraphBuilder } from "../resolve/dependency-graph.ts";
import {
  type CapabilityGapReport,
  WorkloadResolver,
} from "../resolve/workload-resolver.ts";
import type { Renderer } from "../render/renderer.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { PresentedArtifact } from "../render/presented-artifact.ts";
import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Ejector } from "./ejector.ts";
import type { Planner } from "./planner.ts";
import type { Applier } from "./applier.ts";
import type { IntentDiff } from "./intent-diff.ts";
import type { ReleaseAvailabilityPreflight } from "./release-availability-preflight.ts";
import type { LocalArtifactsPacker } from "./release-packer.ts";
import type { WatchRunner } from "./watch-runner.ts";

export type { CapabilityGapReport };

export type Termination = "eject" | "plan" | "apply";

export interface DeployOptions {
  readonly artifacts: ArtifactsSource;
  readonly termination: Termination;
  /** Section 11's "chosen mechanism for now": non-interactive capability-gap policy. `false` (the honest default) hard-fails on any unmet capability; `true` proceeds, still reporting every gap back in the result for the caller to show (a suppressed lint, not a silent one). */
  readonly acceptCapabilityGaps: boolean;
  /** Which released version a published release resolves to — also what the availability preflight checks for, on a published apply. Unused for a local apply, where the preflight never runs. */
  readonly version: string;
  /** Whether a local apply packs its referenced releases first (Section 7). `true` by default; `false` for someone who already packed manually or is iterating on deploy config only. Unused for published artifacts, where packing never runs regardless. */
  readonly pack: boolean;
  /** Run the kit's long-lived watch command instead of a one-shot apply (Section 8) — a variant of `apply`, not a fourth termination. Ignored by `eject`/`plan`. */
  readonly watch: boolean;
}

export class CapabilityGapError extends Error {
  constructor(readonly gaps: readonly CapabilityGapReport[]) {
    super(
      `Unmet capabilities (pass --accept-capability-gaps to proceed anyway):\n${
        gaps.map((report) =>
          `  ${report.resource}: "${report.gap.capability}" (requested ${report.gap.requested})`
        ).join("\n")
      }`,
    );
    this.name = "CapabilityGapError";
  }
}

export type DeployResult =
  | {
    readonly termination: "eject";
    readonly artifact: PresentedArtifact;
    readonly gaps: readonly CapabilityGapReport[];
  }
  | {
    readonly termination: "plan";
    readonly diff: IntentDiff;
    readonly gaps: readonly CapabilityGapReport[];
  }
  | {
    readonly termination: "apply";
    readonly gaps: readonly CapabilityGapReport[];
  };

/**
 * The top-level driver (Section 4): the core owns the loop, kits are only
 * ever called, never in charge of it (the driver inversion). Resolves every
 * resource via `WorkloadResolver`, applies capability-gap policy (kept out
 * of the pure resolution agents per Section 11 — `ProvisionerSelector` only
 * reports gaps, this is where they're acted on), builds the dependency
 * graph, renders once, then dispatches to whichever termination was asked
 * for. `plan` is a prefix of `apply` (Section 9) by construction — both run
 * the identical code up through `render`, diverging only in the final
 * `switch`.
 */
export class DeploymentCoordinator {
  private readonly resolver: WorkloadResolver;
  private readonly referenceValidator: ReferenceValidator;

  constructor(
    registry: ContractRegistry,
    private readonly renderer: Renderer,
    private readonly ejector: Ejector,
    private readonly planner: Planner,
    private readonly applier: Applier,
    private readonly availabilityPreflight: ReleaseAvailabilityPreflight,
    private readonly localArtifactsPacker: LocalArtifactsPacker,
    private readonly watchRunner: WatchRunner,
    private readonly graphBuilder: DependencyGraphBuilder =
      new DependencyGraphBuilder(),
  ) {
    this.resolver = new WorkloadResolver(registry);
    this.referenceValidator = new ReferenceValidator(registry);
  }

  /** `name` is the deployment's own name (`ens deploy <name> <kit>`) — passed through to `apply`/watch for a kit to scope its own native invocation by (a compose project name, a CloudFormation stack name). Throws `ContractError` for any reference that targets an undeclared release/resource/output before doing any resolution work, then `CapabilityGapError` (naming every unmet capability) before rendering anything, unless `options.acceptCapabilityGaps` is set. For a published apply, runs the availability preflight right before the terminal step, throwing `ReleaseAvailabilityError` if any declared release isn't actually reachable yet; for a local apply (unless `options.pack` is `false`), packs the referenced releases instead, throwing `ReleasePackError` if any of them fails. When `options.watch` is set, runs the kit's long-lived watch command instead of a one-shot apply, throwing `WatchNotSupportedError` if the kit has none for this target. */
  async deploy(
    name: string,
    workload: Workload,
    target: Target,
    options: DeployOptions,
  ): Promise<DeployResult> {
    this.referenceValidator.validate(workload);

    const { requests, selections, gaps } = this.resolver.resolve(
      workload,
      target,
    );

    if (gaps.length > 0 && !options.acceptCapabilityGaps) {
      throw new CapabilityGapError(gaps);
    }

    const graph = this.graphBuilder.build(workload);
    const artifacts = this.renderer.render(
      workload,
      requests,
      selections,
      graph,
      options.artifacts,
    );

    if (options.termination === "apply") {
      if (options.artifacts === "published") {
        await this.availabilityPreflight.check(
          workload,
          options.artifacts,
          options.version,
        );
      } else if (options.pack) {
        await this.localArtifactsPacker.packReferenced(workload, graph);
      }

      if (options.watch) {
        await this.watchRunner.watch(artifacts, graph, target.kit, name);
        return { termination: "apply", gaps };
      }
    }

    return await this.terminate(
      options.termination,
      artifacts,
      graph,
      target,
      gaps,
      name,
    );
  }

  private async terminate(
    termination: Termination,
    artifacts: Artifacts,
    graph: DependencyGraph,
    target: Target,
    gaps: readonly CapabilityGapReport[],
    name: string,
  ): Promise<DeployResult> {
    switch (termination) {
      case "eject": {
        const artifact = await this.ejector.eject(artifacts, graph, target.kit);
        return { termination: "eject", artifact, gaps };
      }
      case "plan": {
        const diff = await this.planner.plan(artifacts, graph, target.kit);
        return { termination: "plan", diff, gaps };
      }
      case "apply": {
        await this.applier.apply(artifacts, graph, target.kit, name);
        return { termination: "apply", gaps };
      }
    }
  }
}
