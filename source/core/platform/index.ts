import type {
  GitRepositoryStore,
  RunStore,
  WorkflowGitLinkStore,
} from "@ensemble/core";
import { createGithubTriggerFeatures } from "./workflow/triggers/github/index.ts";
import { createManualTriggerFeature } from "./workflow/triggers/manual/index.ts";
import { workflowRegistryFeature } from "./workflow/registry/index.ts";
import { createGitIntegrationFeatures } from "./workflow/integrations/git/index.ts";
import { createDashboardFeatures } from "./workflow/dashboard/index.ts";
import { createSecretsFeatures } from "./workflow/secrets/index.ts";
import type { Feature } from "./features.ts";

export { type Feature, isFeatureEnabled } from "./features.ts";
export * from "./workflow/index.ts";
export * from "./workflow/secrets/index.ts";

export interface PlatformStores {
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
  runs: RunStore;
}

/**
 * Every feature the platform ships, in match order — first pattern+method
 * match wins. Takes the process's own store instances (opened once by the
 * caller, e.g. apps/server/main.ts) and threads them into every route that
 * needs one.
 */
export function createAllFeatures(stores: PlatformStores): Feature[] {
  return [
    createManualTriggerFeature(stores),
    ...createGithubTriggerFeatures(stores),
    workflowRegistryFeature,
    ...createGitIntegrationFeatures(stores.repositories),
    ...createDashboardFeatures(stores),
    ...createSecretsFeatures(stores.repositories, stores.links),
  ];
}
