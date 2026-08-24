import * as Core from "@ensemble/core";
import { createGithubTriggerFeatures } from "./workflow/triggers/github/index.ts";
import { createManualTriggerFeature } from "./workflow/triggers/manual/index.ts";
import { createWorkflowRegistryFeature } from "./workflow/registry/index.ts";
import { createGitIntegrationFeatures } from "./workflow/integrations/git/index.ts";
import { createDashboardFeatures } from "./workflow/dashboard/index.ts";
import { createSecretsFeatures } from "./workflow/secrets/index.ts";
import { createContextValuesFeatures } from "./workflow/context-values/index.ts";
import { createDebugFeature } from "./debug/index.ts";
import type { Feature } from "./features.ts";

export { type Feature, isFeatureEnabled } from "./features.ts";

export * as ManualTrigger from "./workflow/triggers/manual/index.ts";
export * as GithubTrigger from "./workflow/triggers/github/index.ts";
export * as Registry from "./workflow/registry/index.ts";
export * as Dashboard from "./workflow/dashboard/index.ts";
export * as GitIntegration from "./workflow/integrations/git/index.ts";
export * as Secrets from "./workflow/secrets/index.ts";
export * as ContextValues from "./workflow/context-values/index.ts";
export * as Debug from "./debug/index.ts";

export interface PlatformStores {
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  runs: Core.Runs.RunStore;
}

/**
 * The base path/URL every platform feature mounts its routes under — decided
 * by the application layer (e.g. apps/server/main.ts), not core: core only
 * owns each resource's route grammar (which params/segments exist under it).
 */
export interface PlatformRoutePrefixes {
  /** The /v1/workflows resource family: dashboard, registry, manual trigger, and the github-simulated manual trigger all share this root today. Also scopes the ws_token cookie minted by the dashboard's auth-ws-token route. */
  workflowsBasePath: string;
  /** The auth/ws-token exchange endpoint. */
  authPath: string;
  secretsBasePath: string;
  contextValuesBasePath: string;
  gitIntegrationBasePath: string;
  /** Fixed, global URL GitHub itself posts push events to. */
  githubWebhookPath: string;
  debugPath: string;
}

/**
 * Every feature the platform ships, in match order — first pattern+method
 * match wins. Takes the process's own store instances (opened once by the
 * caller, e.g. apps/server/main.ts) and threads them into every route that
 * needs one.
 */
export function createAllFeatures(stores: PlatformStores, routes: PlatformRoutePrefixes): Feature[] {
  const features = [
    createManualTriggerFeature(stores, routes.workflowsBasePath),
    ...createGithubTriggerFeatures(stores, {
      webhookPath: routes.githubWebhookPath,
      workflowsBasePath: routes.workflowsBasePath,
    }),
    createWorkflowRegistryFeature(routes.workflowsBasePath),
    ...createGitIntegrationFeatures(stores.repositories, routes.gitIntegrationBasePath),
    ...createDashboardFeatures(stores, {
      basePath: routes.workflowsBasePath,
      authPath: routes.authPath,
    }),
    ...createSecretsFeatures(stores.repositories, stores.links, routes.secretsBasePath),
    ...createContextValuesFeatures(stores.repositories, stores.links, routes.contextValuesBasePath),
  ];
  return [
    ...features,
    createDebugFeature(features.map((feature) => feature.name), routes.debugPath),
  ];
}
