import { handleManualTrigger } from "./handler.ts";
import type { Feature } from "../../../features.ts";

export { type ManualTriggerRequest, type ManualTriggerResponse } from "./contract.ts";
export { handleManualTrigger } from "./handler.ts";
export { type ManualTriggerClient, manualTriggerClient, type ManualTriggerClientOptions } from "./client.ts";
export { extractManualInputs, ManualInputError, resolveJobInput } from "./extract.ts";

export const manualTriggerFeature: Feature = {
  name: "manual-trigger",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/trigger" }),
  handle: handleManualTrigger,
};
