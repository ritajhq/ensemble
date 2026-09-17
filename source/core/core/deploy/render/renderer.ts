import type { Category, Workload } from "../workload.ts";
import type { ArtifactsSource } from "../artifacts-source.ts";
import type { Reference, ReferenceSyntax } from "../reference.ts";
import type {
  DependencyGraph,
  ResourceId,
} from "../resolve/dependency-graph.ts";
import type { ProvisioningRequest } from "../resolve/provisioning-request.ts";
import type { SelectedProvisioner } from "../resolve/selected-provisioner.ts";
import type { ReleaseLocatorPort } from "../kit/release-locator.ts";
import { ReferenceSyntax as ReferenceParser } from "../reference.ts";
import type { ContractRegistry } from "../contracts/registry.ts";
import type { ArtifactFragment, Artifacts } from "./artifact.ts";
import { OutputsLedger } from "./outputs-ledger.ts";
import type { ReferenceResolver } from "./reference-resolver.ts";

/** Categories that never produce their own artifact fragment — pure reference targets consumed directly by whatever declares them (Section 5: `secrets`/`variables` are developer-supplied data; `external` is provisioned by nothing). */
const UNRENDERED_CATEGORIES: readonly string[] = [
  "secrets",
  "variables",
  "external",
];

export class RendererError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererError";
  }
}

/**
 * The pure driver of the whole render step (Section 3/8): walks the
 * `DependencyGraph`'s batches in order, resolving each resource's references
 * against everything rendered so far (`OutputsLedger` + `ReferenceResolver`),
 * then calling its selected provisioner. A `release` node has no
 * `ProvisioningRequest` of its own — it's located via `ReleaseLocatorPort`
 * directly. `secrets`/`variables`/`external` nodes are skipped entirely: nothing
 * provisions them, they only exist as reference targets other resources
 * dereference on their own terms. Also enforces Section 6's portability
 * contract at render time: a provisioner's declared outputs must exactly
 * match its contract's `outputs` list — no more, no less — since that list
 * is what lets the same manifest render on any kit with identical
 * reference targets.
 */
export class Renderer {
  constructor(
    private readonly referenceResolver: ReferenceResolver,
    private readonly releaseLocator: ReleaseLocatorPort,
    private readonly registry: ContractRegistry,
    private readonly syntax: ReferenceSyntax = new ReferenceParser(),
  ) {}

  async render(
    workload: Workload,
    requests: ReadonlyMap<string, ProvisioningRequest>,
    selections: ReadonlyMap<string, SelectedProvisioner>,
    graph: DependencyGraph,
    artifactsSource: ArtifactsSource,
  ): Promise<Artifacts> {
    return (await this.renderWithLedger(
      workload,
      requests,
      selections,
      graph,
      artifactsSource,
    )).artifacts;
  }

  /** Same render pass as `render`, also handing back the `OutputsLedger` it built — `ens deploy explain` (Phase 8) needs a resource's real resolved outputs, which only exist once the whole workload has actually been rendered in dependency order. `render` stays the normal entry point; this is for callers that need to inspect the ledger afterward. */
  async renderWithLedger(
    workload: Workload,
    requests: ReadonlyMap<string, ProvisioningRequest>,
    selections: ReadonlyMap<string, SelectedProvisioner>,
    graph: DependencyGraph,
    artifactsSource: ArtifactsSource,
  ): Promise<{ artifacts: Artifacts; ledger: OutputsLedger }> {
    const ledger = new OutputsLedger();
    const fragments: ArtifactFragment[] = [];

    for (const batch of graph.batches()) {
      for (const id of batch) {
        const fragment = await this.renderOne(
          id,
          workload,
          requests,
          selections,
          ledger,
          artifactsSource,
        );
        if (fragment) fragments.push(fragment);
      }
    }

    return { artifacts: { fragments }, ledger };
  }

  private async renderOne(
    id: ResourceId,
    workload: Workload,
    requests: ReadonlyMap<string, ProvisioningRequest>,
    selections: ReadonlyMap<string, SelectedProvisioner>,
    ledger: OutputsLedger,
    artifactsSource: ArtifactsSource,
  ): Promise<ArtifactFragment | undefined> {
    if (id.category === "release") {
      ledger.recordRelease(
        id.name,
        this.releaseLocator.locate(id.name, artifactsSource).ref,
      );
      return undefined;
    }
    if (UNRENDERED_CATEGORIES.includes(id.category)) {
      return undefined;
    }

    const key = `${id.category}.${id.name}`;
    const request = requests.get(key);
    const selection = selections.get(key);
    if (!request || !selection) {
      throw new RendererError(
        `No provisioning request/selection found for "${key}".`,
      );
    }
    if (!selection.provisioner.provision) {
      throw new RendererError(
        `The provisioner selected for "${key}" doesn't support provisioning yet.`,
      );
    }

    const params = await this.resolveValue(request.params, ledger, workload) as
      Readonly<Record<string, unknown>>;
    const outcome = await selection.provisioner.provision({
      category: request.category,
      name: request.name,
      type: request.type,
      class: request.class,
      params,
      values: request.values,
      secrets: workload.secrets ?? {},
    });

    this.validateOutputs(id, request.type, outcome.outputs);
    ledger.record(id.category, id.name, request.type, outcome.outputs);
    return outcome.fragment;
  }

  /** Section 6: "validate each kit's produced outputs against them at render time." A missing declared output would silently break portability the moment another manifest referenced it on a different kit; an extra undeclared one is just as much a contract violation, even if harmless today. */
  private validateOutputs(
    id: ResourceId,
    type: string,
    outputs: Readonly<Record<string, unknown>>,
  ): void {
    const contract = this.registry.contractFor(id.category as Category, type);
    if (!contract) return;

    const declared = new Set(contract.outputs);
    const produced = new Set(Object.keys(outputs));
    const missing = [...declared].filter((key) => !produced.has(key));
    const extra = [...produced].filter((key) => !declared.has(key));
    if (missing.length === 0 && extra.length === 0) return;

    const parts = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
    if (extra.length > 0) parts.push(`extra: ${extra.join(", ")}`);
    throw new RendererError(
      `${contract.id}'s provisioner produced the wrong outputs for "${id.category}.${id.name}" (${
        parts.join("; ")
      }).`,
    );
  }

  private async resolveValue(
    value: unknown,
    ledger: OutputsLedger,
    workload: Workload,
  ): Promise<unknown> {
    const reference = this.syntax.parse(value);
    if (reference) {
      return reference.category === "external"
        ? this.resolveExternalReference(reference, workload)
        : await this.bakeOrDefer(reference, ledger);
    }
    if (Array.isArray(value)) {
      return await Promise.all(
        value.map((item) => this.resolveValue(item, ledger, workload)),
      );
    }
    if (typeof value === "object" && value !== null) {
      const resolved: Record<string, unknown> = {};
      for (
        const [key, nested] of Object.entries(value as Record<string, unknown>)
      ) {
        resolved[key] = await this.resolveValue(nested, ledger, workload);
      }
      return resolved;
    }
    return value;
  }

  /**
   * `external` entries are manifest-declared literals, not provisioner
   * outputs (Section 5: "provisioned by nothing") — resolved straight off
   * the workload rather than through the ledger/`Realization`. Always baked:
   * there's no provisioner in the loop for a value to ever be deferred to.
   * Trusts `ReferenceValidator` already confirmed the resource and field
   * exist (same trust `OutputsLedger` places in it for every other category).
   */
  private resolveExternalReference(
    reference: Reference,
    workload: Workload,
  ): unknown {
    const declaration = workload.external![reference.name];
    return declaration[reference.output! as "type" | "name"];
  }

  private async bakeOrDefer(reference: Reference, ledger: OutputsLedger): Promise<unknown> {
    const resolved = await this.referenceResolver.resolve(reference, ledger);
    const resolvedValue = resolved.mode === "baked"
      ? resolved.value
      : resolved.wiring;
    // The ledger hands back the same stored object on every lookup — if two
    // different consumers reference the same output (or one provisioner's own
    // fragment and its output both embed the same wiring object, as a dynamic
    // `!GetAtt`/`Fn::Sub` value naturally would), cloning here guarantees no two
    // places in the final artifact ever share object identity. That matters
    // because a serializer that notices shared identity (e.g. `@std/yaml`) emits
    // YAML anchors/aliases (`&x`/`*x`) — syntax some targets' own template
    // parsers (CloudFormation's included) don't reliably support.
    return typeof resolvedValue === "object" && resolvedValue !== null
      ? structuredClone(resolvedValue)
      : resolvedValue;
  }
}
