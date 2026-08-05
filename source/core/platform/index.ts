import { githubTriggerFeature, manualGithubTriggerFeature } from "./workflow/triggers/github/index.ts";
import { manualTriggerFeature } from "./workflow/triggers/manual/index.ts";
import { workflowRegistryFeature } from "./workflow/registry/index.ts";
import {
  gitIntegrationCloneFeature,
  gitIntegrationListRepositoriesFeature,
  gitIntegrationRefreshRepositoryFeature,
  gitIntegrationRemoveRepositoryFeature,
  gitIntegrationRemoveWorkflowFeature,
  gitIntegrationRestoreWorkflowFeature,
} from "./workflow/integrations/git/index.ts";
import {
  getStepLogFeature,
  listRunStepsFeature,
  listRunsFeature,
  listWorkflowFilesFeature,
  listWorkflowsFeature,
  mintSseTokenFeature,
  readWorkflowFileFeature,
  runEventsFeature,
  runWorkflowFeature,
} from "./workflow/dashboard/index.ts";
import type { Feature } from "./features.ts";

export { type Feature, isFeatureEnabled } from "./features.ts";
export * from "./workflow/index.ts";

/**
 * Every feature the platform ships, in match order — first pattern+method
 * match wins.
 */
export const allFeatures: Feature[] = [
  manualTriggerFeature,
  githubTriggerFeature,
  manualGithubTriggerFeature,
  workflowRegistryFeature,
  gitIntegrationCloneFeature,
  gitIntegrationListRepositoriesFeature,
  gitIntegrationRefreshRepositoryFeature,
  gitIntegrationRemoveRepositoryFeature,
  gitIntegrationRemoveWorkflowFeature,
  gitIntegrationRestoreWorkflowFeature,
  listWorkflowsFeature,
  listRunsFeature,
  listRunStepsFeature,
  getStepLogFeature,
  runWorkflowFeature,
  mintSseTokenFeature,
  runEventsFeature,
  listWorkflowFilesFeature,
  readWorkflowFileFeature,
];
