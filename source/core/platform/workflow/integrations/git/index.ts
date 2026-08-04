import { handleCloneGitWorkflows } from "./handler.ts";
import type { Feature } from "../../../features.ts";

export { handleCloneGitWorkflows } from "./handler.ts";
export type { CloneGitWorkflowsRequest, CloneGitWorkflowsResponse } from "./contract.ts";

export const gitIntegrationCloneFeature: Feature = {
  name: "git-integration-clone",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/integrations/git/clone" }),
  handle: handleCloneGitWorkflows,
};
