import { triggerWorkflowFeature } from "./trigger-workflow/index.ts";
import type { Feature } from "./features.ts";

export { type Feature, isFeatureEnabled } from "./features.ts";
export * from "./trigger-workflow/index.ts";

/** Every feature the platform ships. Each is independently gated — see isFeatureEnabled. */
export const allFeatures: Feature[] = [triggerWorkflowFeature];
