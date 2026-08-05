import { handleGithubTrigger } from "./handler.ts";
import { handleManualGithubTrigger } from "./manual-handler.ts";
import type { Feature } from "../../../features.ts";

export { handleGithubTrigger } from "./handler.ts";
export { handleManualGithubTrigger } from "./manual-handler.ts";
export {
  isManualGithubTriggerRequest,
  type ManualGithubTriggerRequest,
  type ManualGithubTriggerResponse,
} from "./manual-contract.ts";

export const githubTriggerFeature: Feature = {
  name: "github-trigger",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/webhooks/github" }),
  handle: handleGithubTrigger,
};

export const manualGithubTriggerFeature: Feature = {
  name: "manual-github-trigger",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/trigger/github" }),
  handle: handleManualGithubTrigger,
};
