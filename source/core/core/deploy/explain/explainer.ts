import type { Category, Workload } from "../workload.ts";
import type { Target } from "../kit/target.ts";
import type { ArtifactsSource } from "../artifacts-source.ts";
import type { Knowability } from "../kit/realization.ts";
import type { ContractRegistry } from "../contracts/registry.ts";
import { ReferenceValidator } from "../contracts/reference-validator.ts";
import { DependencyGraphBuilder } from "../resolve/dependency-graph.ts";
import { ProvisionerSelector } from "../resolve/provisioner-selector.ts";
import { WorkloadResolver } from "../resolve/workload-resolver.ts";
import type {
  CapabilityGap,
  ProvisionerMatchExplanation,
} from "../resolve/selected-provisioner.ts";
import type { ResolvedValue } from "../resolve/resolved-values.ts";
import type { Renderer } from "../render/renderer.ts";

export class ResourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

/** One declared output's resolved reality: its knowability, and the raw value the ledger holds for it — a concrete value when `static`, the target's own native wiring when `dynamic` (never a guess, G3). */
export interface OutputExplanation {
  readonly knowability: Knowability;
  readonly value: unknown;
}

/**
 * Everything `ens deploy explain <resource>` (Phase 8) shows about one
 * resource: which provisioner matched and why the others didn't, which
 * layer supplied each negotiated value (`values`' own provenance),
 * unreviewed kit defaults flagged separately (Section 6: "an unreviewed
 * default can't silently govern production"), accepted capability gaps, and
 * the resource's real resolved outputs.
 */
export interface ResourceExplanation {
  readonly category: Category;
  readonly name: string;
  readonly type: string;
  readonly contractId: string;
  readonly provisionerMatches: readonly ProvisionerMatchExplanation[];
  readonly values: Readonly<Record<string, ResolvedValue>>;
  readonly flaggedDefaults: readonly string[];
  readonly capabilityGaps: readonly CapabilityGap[];
  readonly outputs: Readonly<Record<string, OutputExplanation>>;
}

/**
 * Explains one resource by resolving and rendering the *whole* workload
 * (a resource's outputs, and whether a sibling resource's own provisioning
 * has a problem, are only knowable in that context — the same context a
 * real `deploy` would need to succeed) and then reporting everything Phase
 * 8 asks for about the one resource requested. Deliberately does not apply
 * capability-gap policy (unlike `DeploymentCoordinator`) — explaining a gap
 * *is* the point, not something to hard-fail on.
 */
export class Explainer {
  constructor(
    registry: ContractRegistry,
    private readonly renderer: Renderer,
    private readonly selector: ProvisionerSelector = new ProvisionerSelector(),
    private readonly graphBuilder: DependencyGraphBuilder =
      new DependencyGraphBuilder(),
    private readonly resolver: WorkloadResolver = new WorkloadResolver(
      registry,
    ),
    private readonly referenceValidator: ReferenceValidator =
      new ReferenceValidator(registry),
  ) {}

  /** Throws `ContractError` for any reference that targets an undeclared release/resource/output, `ResourceNotFoundError` if `category.name` isn't declared in the workload. Any other resolution failure (an unknown type, no matching provisioner) propagates as-is — a real deploy would fail for the same reason, regardless of which resource is being explained. */
  async explain(
    workload: Workload,
    target: Target,
    artifacts: ArtifactsSource,
    category: Category,
    name: string,
  ): Promise<ResourceExplanation> {
    this.referenceValidator.validate(workload);

    const key = `${category}.${name}`;
    const resolution = await this.resolver.resolve(workload, target);

    const matched = resolution.matches.get(key);
    const selection = resolution.selections.get(key);
    const values = resolution.values.get(key);
    if (!matched || !selection || !values) {
      throw new ResourceNotFoundError(
        `No resource named "${key}" in this workload.`,
      );
    }

    const graph = this.graphBuilder.build(workload);
    const { ledger } = await this.renderer.renderWithLedger(
      workload,
      resolution.requests,
      resolution.selections,
      graph,
      artifacts,
    );

    const realization = await target.kit.realization();
    const outputs: Record<string, OutputExplanation> = {};
    for (const outputKey of matched.contract.outputs) {
      outputs[outputKey] = {
        knowability: await realization.knowabilityOf(
          category,
          matched.declaration.type,
          outputKey,
        ),
        value: ledger.outputFor(category, name, outputKey),
      };
    }

    const flaggedDefaults = Object.entries(values.values)
      .filter(([, value]) => value.provenance === "default")
      .map(([concern]) => concern);

    return {
      category,
      name,
      type: matched.declaration.type,
      contractId: matched.contract.id,
      provisionerMatches: await this.selector.explain(matched, target),
      values: values.values,
      flaggedDefaults,
      capabilityGaps: selection.gaps,
      outputs,
    };
  }
}
