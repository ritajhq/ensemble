import type * as KitSdk from "@ensemble/kit-sdk";
import type { Fragment, Plan, Target } from "./plan.ts";

/**
 * Assembles a render pass's fragments into one plan. Order is the apply's
 * job (databases and buckets before the Workers bound to them, Workers
 * before the gateway in front of them), not the render's.
 */
export function assemblePlan(
  artifacts: KitSdk.Deploy.Render.Artifacts,
  target: Target,
): Plan {
  const plan = {
    target,
    workers: {},
    databases: {},
    buckets: {},
    gateways: {},
  };
  for (const fragment of artifacts.fragments) {
    const content = fragment.content as Fragment;
    Object.assign(plan.workers, content.workers ?? {});
    Object.assign(plan.databases, content.databases ?? {});
    Object.assign(plan.buckets, content.buckets ?? {});
    Object.assign(plan.gateways, content.gateways ?? {});
  }
  return plan;
}
