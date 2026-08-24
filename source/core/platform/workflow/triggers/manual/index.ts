import type * as Core from "@ensemble/core";
import { handle } from "./handler.ts";
import type { Feature } from "../../../features.ts";

export { type TriggerRequest, type TriggerResponse } from "./contract.ts";
export { handle } from "./handler.ts";
export { type Client, client, type ClientOptions } from "./client.ts";
export { extractManualInputs, ManualInputError, resolveJobInput } from "./extract.ts";

export interface ManualTriggerStores {
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  runs: Core.Runs.RunStore;
}

/** Builds this module's route, bound to `stores` — call once at startup with the process's own store instances. */
export function createManualTriggerFeature(stores: ManualTriggerStores): Feature {
  return {
    name: "manual-trigger",
    method: "POST",
    pattern: new URLPattern({ pathname: "/v1/workflows/:id/trigger" }),
    handle: (request, params) => handle(stores.repositories, stores.links, stores.runs, request, params),
  };
}
