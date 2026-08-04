import { githubTriggerFeature } from "./workflow/triggers/github/index.ts";
import { httpTriggerFeature } from "./workflow/triggers/http/index.ts";
import { workflowRegistryFeature } from "./workflow/registry/index.ts";
import { gitIntegrationCloneFeature } from "./workflow/integrations/git/index.ts";
import {
  getStepLogFeature,
  listRunStepsFeature,
  listRunsFeature,
  listWorkflowFilesFeature,
  listWorkflowsFeature,
  readWorkflowFileFeature,
  runWorkflowFeature,
} from "./workflow/dashboard/index.ts";
import { dashboardStaticFeature } from "./dashboard-static/index.ts";
import type { Feature } from "./features.ts";

export { type Feature, isFeatureEnabled } from "./features.ts";
export * from "./workflow/index.ts";
export { dashboardStaticFeature } from "./dashboard-static/index.ts";

/**
 * Every feature the platform ships, in match order — first pattern+method
 * match wins. dashboardStaticFeature is a `GET /*` catch-all, so it must stay
 * last or it would shadow every specific route after it.
 */
export const allFeatures: Feature[] = [
  httpTriggerFeature,
  githubTriggerFeature,
  workflowRegistryFeature,
  gitIntegrationCloneFeature,
  listWorkflowsFeature,
  listRunsFeature,
  listRunStepsFeature,
  getStepLogFeature,
  runWorkflowFeature,
  listWorkflowFilesFeature,
  readWorkflowFileFeature,
  dashboardStaticFeature,
];
