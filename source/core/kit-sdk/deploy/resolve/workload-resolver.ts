import type { Category, Workload } from "../workload.ts";
import type { Target } from "../kit/target.ts";
import { ContractMatcher } from "./contract-matcher.ts";
import { ProvisionerSelector } from "./provisioner-selector.ts";
import { ValueNegotiator } from "./value-negotiator.ts";
import { RequestAssembler } from "./request-assembler.ts";
import type { MatchedResource } from "./matched-resource.ts";
import type { ProvisioningRequest } from "./provisioning-request.ts";
import type { ResolvedValues } from "./resolved-values.ts";
import type {
  CapabilityGap,
  SelectedProvisioner,
} from "./selected-provisioner.ts";
import type { ContractRegistry } from "../contracts/registry.ts";

/** A resolution-time capability gap, tied back to the resource it came from — the shape both `DeploymentCoordinator` (Phase 6) and `Explainer` (Phase 8) report gaps in. */
export interface CapabilityGapReport {
  readonly resource: string;
  readonly gap: CapabilityGap;
}

/** Every resource in a workload resolved against one target, keyed by `category.name`. */
export interface WorkloadResolution {
  readonly matches: ReadonlyMap<string, MatchedResource>;
  readonly selections: ReadonlyMap<string, SelectedProvisioner>;
  readonly values: ReadonlyMap<string, ResolvedValues>;
  readonly requests: ReadonlyMap<string, ProvisioningRequest>;
  readonly gaps: readonly CapabilityGapReport[];
}

const RESOLVABLE_CATEGORIES = [
  "compute",
  "storage",
  "databases",
  "messaging",
  "networking",
] as const;

/**
 * Runs every resource in a workload through the full resolution pipeline
 * (match → select → negotiate → assemble) against one target — the one place
 * that loop is implemented, used by both `DeploymentCoordinator` (which acts
 * on the result: capability-gap policy, then render) and `Explainer` (which
 * only reports on it). Extracted once a second consumer needed the identical
 * loop, rather than duplicating it (Phase 8).
 */
export class WorkloadResolver {
  private readonly matcher: ContractMatcher;

  constructor(
    registry: ContractRegistry,
    private readonly selector: ProvisionerSelector = new ProvisionerSelector(),
    private readonly negotiator: ValueNegotiator = new ValueNegotiator(),
    private readonly assembler: RequestAssembler = new RequestAssembler(),
  ) {
    this.matcher = new ContractMatcher(registry);
  }

  resolve(workload: Workload, target: Target): WorkloadResolution {
    const matches = new Map<string, MatchedResource>();
    const selections = new Map<string, SelectedProvisioner>();
    const values = new Map<string, ResolvedValues>();
    const requests = new Map<string, ProvisioningRequest>();
    const gaps: CapabilityGapReport[] = [];

    for (const category of RESOLVABLE_CATEGORIES) {
      for (
        const [name, declaration] of Object.entries(
          workload[category as Category] ?? {},
        )
      ) {
        const key = `${category}.${name}`;
        const matched = this.matcher.match(category, name, declaration);
        const selection = this.selector.select(matched, target.kit);
        for (const gap of selection.gaps) gaps.push({ resource: key, gap });

        const resolvedValues = this.negotiator.negotiate(matched, target);

        matches.set(key, matched);
        selections.set(key, selection);
        values.set(key, resolvedValues);
        requests.set(key, this.assembler.assemble(matched, resolvedValues));
      }
    }

    return { matches, selections, values, requests, gaps };
  }
}
