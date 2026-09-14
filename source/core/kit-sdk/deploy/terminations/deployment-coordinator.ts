import type { Workload } from "../workload.ts";
import type { Target } from "../kit/target.ts";
import type { Mode } from "../mode.ts";
import type { ContractRegistry } from "../contracts/registry.ts";
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

export type { CapabilityGapReport };

export type Termination = "eject" | "plan" | "apply";

export interface DeployOptions {
  readonly mode: Mode;
  readonly termination: Termination;
  /** Section 11's "chosen mechanism for now": non-interactive capability-gap policy. `false` (the honest default) hard-fails on any unmet capability; `true` proceeds, still reporting every gap back in the result for the caller to show (a suppressed lint, not a silent one). */
  readonly acceptCapabilityGaps: boolean;
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

  constructor(
    registry: ContractRegistry,
    private readonly renderer: Renderer,
    private readonly ejector: Ejector,
    private readonly planner: Planner,
    private readonly applier: Applier,
    private readonly graphBuilder: DependencyGraphBuilder =
      new DependencyGraphBuilder(),
  ) {
    this.resolver = new WorkloadResolver(registry);
  }

  /** `name` is the deployment's own name (`ens deploy <name> <kit>`) — passed through to `apply` for a kit to scope its own native invocation by (a compose project name, a CloudFormation stack name). Throws `CapabilityGapError` (naming every unmet capability) before rendering anything, unless `options.acceptCapabilityGaps` is set. */
  async deploy(
    name: string,
    workload: Workload,
    target: Target,
    options: DeployOptions,
  ): Promise<DeployResult> {
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
      options.mode,
    );

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
