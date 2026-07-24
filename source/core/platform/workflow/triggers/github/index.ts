import { handleGithubTrigger } from "./handler.ts";
import type { Feature } from "../../../features.ts";

export { handleGithubTrigger } from "./handler.ts";

export const githubTriggerFeature: Feature = {
  name: "github-trigger",
  method: "POST",
  pattern: new URLPattern({ pathname: "/webhooks/github" }),
  handle: handleGithubTrigger,
};
