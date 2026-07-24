import { handleTriggerWorkflow } from "./handler.ts";
import type { Feature } from "../features.ts";

export {
  type TriggerWorkflowRequest,
  type TriggerWorkflowResponse,
} from "./contract.ts";
export { handleTriggerWorkflow } from "./handler.ts";
export {
  type TriggerWorkflowClient,
  triggerWorkflowClient,
  type TriggerWorkflowClientOptions,
} from "./client.ts";

export const triggerWorkflowFeature: Feature = {
  name: "trigger-workflow",
  method: "POST",
  path: "/trigger-workflow",
  handle: handleTriggerWorkflow,
};
