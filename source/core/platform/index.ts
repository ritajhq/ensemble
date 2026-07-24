import { githubTriggerFeature } from "./workflow/triggers/github/index.ts";
import { httpTriggerFeature } from "./workflow/triggers/http/index.ts";
import { workflowRegistryFeature } from "./workflow/registry/index.ts";
import type { Feature } from "./features.ts";

export { type Feature, isFeatureEnabled } from "./features.ts";
export * from "./workflow/index.ts";

/** Every feature the platform ships. Each is independently gated — see isFeatureEnabled. */
export const allFeatures: Feature[] = [httpTriggerFeature, githubTriggerFeature, workflowRegistryFeature];
