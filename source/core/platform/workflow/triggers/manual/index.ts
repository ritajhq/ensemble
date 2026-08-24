import { ManualTriggerHandlers, type ManualTriggerStores } from "./handler.ts";
import { route, type Feature } from "../../../features.ts";

export { type TriggerRequest, type TriggerResponse } from "./contract.ts";
export { ManualTriggerHandlers, type ManualTriggerStores } from "./handler.ts";
export { type Client, client, type ClientOptions } from "./client.ts";
export { extractManualInputs, ManualInputError, resolveJobInput } from "./extract.ts";

/** Builds this module's route, bound to `stores` — call once at startup with the process's own store instances. */
export function createManualTriggerFeature(stores: ManualTriggerStores, basePath: string): Feature {
  const handlers = new ManualTriggerHandlers(stores);
  return route("manual-trigger", "POST", `${basePath}/:id/trigger`, (request, params) => handlers.handle(request, params));
}
