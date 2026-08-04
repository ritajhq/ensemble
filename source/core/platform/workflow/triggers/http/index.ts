import { handleHttpTrigger } from "./handler.ts";
import type { Feature } from "../../../features.ts";

export { type HttpTriggerRequest, type HttpTriggerResponse } from "./contract.ts";
export { handleHttpTrigger } from "./handler.ts";
export { type HttpTriggerClient, httpTriggerClient, type HttpTriggerClientOptions } from "./client.ts";

export const httpTriggerFeature: Feature = {
  name: "http-trigger",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/trigger" }),
  handle: handleHttpTrigger,
};
