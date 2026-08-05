import {
  handleGetStepLog,
  handleListRunSteps,
  handleListRuns,
  handleListWorkflowFiles,
  handleListWorkflows,
  handleMintSseToken,
  handleReadWorkflowFile,
  handleRunEvents,
  handleRunWorkflow,
} from "./handler.ts";
import type { Feature } from "../../features.ts";

export {
  type GetStepLogResponse,
  type ListRunsResponse,
  type ListRunStepsResponse,
  type ListWorkflowFilesResponse,
  type ListWorkflowsResponse,
  type MintSseTokenResponse,
  type ReadWorkflowFileResponse,
  type RunWorkflowResponse,
  type WorkflowSummary,
} from "./contract.ts";
export {
  handleGetStepLog,
  handleListRunSteps,
  handleListRuns,
  handleListWorkflowFiles,
  handleListWorkflows,
  handleMintSseToken,
  handleReadWorkflowFile,
  handleRunEvents,
  handleRunWorkflow,
} from "./handler.ts";
export { dashboardClient, type DashboardClient, type DashboardClientOptions } from "./client.ts";

export const listWorkflowsFeature: Feature = {
  name: "workflow-list",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/workflows" }),
  handle: handleListWorkflows,
};

export const listRunsFeature: Feature = {
  name: "workflow-runs",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs" }),
  handle: handleListRuns,
};

export const runWorkflowFeature: Feature = {
  name: "workflow-run",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/run" }),
  handle: handleRunWorkflow,
};

export const listRunStepsFeature: Feature = {
  name: "workflow-run-steps",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/steps" }),
  handle: handleListRunSteps,
};

export const getStepLogFeature: Feature = {
  name: "workflow-run-step-log",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/steps/:jobId/:index/log" }),
  handle: handleGetStepLog,
};

export const listWorkflowFilesFeature: Feature = {
  name: "workflow-files-list",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/files" }),
  handle: handleListWorkflowFiles,
};

export const mintSseTokenFeature: Feature = {
  name: "auth-sse-token",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/auth/sse-token" }),
  handle: handleMintSseToken,
};

export const runEventsFeature: Feature = {
  name: "workflow-run-events",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/events" }),
  handle: handleRunEvents,
};

export const readWorkflowFileFeature: Feature = {
  name: "workflow-files-read",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/workflows/:id/files/*" }),
  handle: handleReadWorkflowFile,
};
