import type { Target } from "../kit/target.ts";
import type { Kit } from "../kit/kit.ts";
import type { Provisioner } from "../kit/provisioner.ts";
import type { MatchedResource } from "./matched-resource.ts";
import {
  type CapabilityGap,
  NoMatchingProvisionerError,
  type ProvisionerMatchExplanation,
  type SelectedProvisioner,
} from "./selected-provisioner.ts";

/** Selects the first provisioner in a kit's set that matches a resource (Section 10's first-match rule), and reports any capability gaps against that kit's realization. */
export class ProvisionerSelector {
  /** Throws `NoMatchingProvisionerError` if nothing in the kit's provisioner set matches at all. */
  async select(resource: MatchedResource, target: Target): Promise<SelectedProvisioner> {
    const runtime = this.effectiveRuntime(resource, target);
    let provisioner: Provisioner | undefined;
    for (const candidate of await target.kit.provisioners()) {
      if (await candidate.matches(resource, runtime)) {
        provisioner = candidate;
        break;
      }
    }
    if (!provisioner) {
      throw new NoMatchingProvisionerError(
        `No provisioner matches ${resource.category}.${resource.name} (type "${resource.declaration.type}").`,
      );
    }
    return {
      provisioner,
      gaps: await this.findCapabilityGaps(resource, target.kit),
    };
  }

  /** Every provisioner in the kit's set, in order, with its own match result — "which one matched, and why the others didn't" (`ens deploy explain`, Phase 8). Never throws even when nothing matches (that's `select`'s job); this is a pure diagnostic. */
  async explain(
    resource: MatchedResource,
    target: Target,
  ): Promise<readonly ProvisionerMatchExplanation[]> {
    const runtime = this.effectiveRuntime(resource, target);
    const provisioners = await target.kit.provisioners();
    return await Promise.all(provisioners.map(async (provisioner, index) => ({
      description: await this.describe(provisioner, index),
      matched: await provisioner.matches(resource, runtime),
    })));
  }

  /** The effective runtime for one resource: a per-resource override if the manifest ever declares one, else the target's own default — only the default is wired today (the watch/develop plan's Section 5 reserves the override half, not yet exposed in the manifest). Structured as a resource-aware lookup now so adding the override later only changes this method's body, never its signature or callers. */
  private effectiveRuntime(
    _resource: MatchedResource,
    target: Target,
  ): string | undefined {
    return target.runtime;
  }

  private async describe(provisioner: Provisioner, index: number): Promise<string> {
    return await provisioner.describe?.() ?? `provisioner #${index + 1}`;
  }

  private async findCapabilityGaps(
    resource: MatchedResource,
    kit: Kit,
  ): Promise<CapabilityGap[]> {
    const capabilities = resource.declaration.capabilities ?? {};
    const realization = await kit.realization();
    const gaps: CapabilityGap[] = [];

    for (const [capability, requested] of Object.entries(capabilities)) {
      if (
        await realization.supportsCapability(
          resource.category,
          resource.declaration.type,
          capability,
        )
      ) continue;
      gaps.push({ capability, requested });
    }
    return gaps;
  }
}
