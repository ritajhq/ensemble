import { handleUploadWorkflow } from "./handler.ts";
import { route, type Feature } from "../../features.ts";

export { handleUploadWorkflow } from "./handler.ts";
export {
  type Client,
  client,
  type ClientOptions,
  type UploadResponse,
} from "./client.ts";

export function createWorkflowRegistryFeature(basePath: string): Feature {
  return route("workflow-registry", "PUT", `${basePath}/:id`, handleUploadWorkflow);
}
