import { GithubTriggerHandlers, type GithubTriggerStores } from "./handler.ts";
import { route, type Feature } from "../../../features.ts";

export { GithubTriggerHandlers, type GithubTriggerStores } from "./handler.ts";
export {
  isManualTriggerRequest,
  type ManualTriggerRequest,
  type ManualTriggerResponse,
} from "./manual-contract.ts";

export interface GithubTriggerRoutePaths {
  /** Fixed, global URL GitHub itself posts push events to — not workflow-scoped. */
  webhookPath: string;
  /** Base path for the /v1/workflows resource family, under which the dashboard-simulated manual trigger route lives. */
  workflowsBasePath: string;
}

/** Builds this module's routes, bound to `stores` — call once at startup with the process's own store instances. */
export function createGithubTriggerFeatures(stores: GithubTriggerStores, paths: GithubTriggerRoutePaths): Feature[] {
  const handlers = new GithubTriggerHandlers(stores);

  return [
    route("github-trigger", "POST", paths.webhookPath, (request) => handlers.handleWebhook(request)),
    route("manual-github-trigger", "POST", `${paths.workflowsBasePath}/:id/trigger/github`, (request, params) => handlers.handleManual(request, params)),
  ];
}
