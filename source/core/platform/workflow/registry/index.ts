import { handleUploadWorkflow } from "./handler.ts";
import type { Feature } from "../../features.ts";

export { handleUploadWorkflow } from "./handler.ts";
export {
  type WorkflowRegistryClient,
  workflowRegistryClient,
  type WorkflowRegistryClientOptions,
  type WorkflowUploadResponse,
} from "./client.ts";

export const workflowRegistryFeature: Feature = {
  name: "workflow-registry",
  method: "PUT",
  pattern: new URLPattern({ pathname: "/workflows/:name" }),
  handle: handleUploadWorkflow,
};
