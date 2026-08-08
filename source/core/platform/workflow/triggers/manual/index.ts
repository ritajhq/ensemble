import type { GitRepositoryStore, RunStore, WorkflowGitLinkStore } from "@ensemble/core";
import { handleManualTrigger } from "./handler.ts";
import type { Feature } from "../../../features.ts";

export { type ManualTriggerRequest, type ManualTriggerResponse } from "./contract.ts";
export { handleManualTrigger } from "./handler.ts";
export { type ManualTriggerClient, manualTriggerClient, type ManualTriggerClientOptions } from "./client.ts";
export { extractManualInputs, ManualInputError, resolveJobInput } from "./extract.ts";

export interface ManualTriggerStores {
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
  runs: RunStore;
}

/** Builds this module's route, bound to `stores` — call once at startup with the process's own store instances. */
export function createManualTriggerFeature(stores: ManualTriggerStores): Feature {
  return {
    name: "manual-trigger",
    method: "POST",
    pattern: new URLPattern({ pathname: "/v1/workflows/:id/trigger" }),
    handle: (request, params) => handleManualTrigger(stores.repositories, stores.links, stores.runs, request, params),
  };
}
