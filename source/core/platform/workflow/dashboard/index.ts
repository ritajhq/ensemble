import type { GitRepositoryStore, RunStore, WorkflowGitLinkStore } from "@ensemble/core";
import {
  handleCreateWorkflow,
  handleDeleteRun,
  handleDeleteWorkflow,
  handleGetStepLog,
  handleGetWorkflow,
  handleListRunSteps,
  handleListRuns,
  handleListWorkflowFiles,
  handleListWorkflows,
  handleMintWsToken,
  handleReadWorkflowFile,
  handleRunEvents,
  handleRunWorkflow,
} from "./handler.ts";
import type { Feature } from "../../features.ts";

export {
  type CreateWorkflowGitSourceRequest,
  type CreateWorkflowRequest,
  type CreateWorkflowResponse,
  type DeleteRunResponse,
  type DeleteWorkflowResponse,
  type GetStepLogResponse,
  type GetWorkflowResponse,
  type ListRunsResponse,
  type ListRunStepsResponse,
  type ListWorkflowFilesResponse,
  type ListWorkflowsResponse,
  type MintWsTokenResponse,
  type ReadWorkflowFileResponse,
  type RunWorkflowResponse,
  type WorkflowSummary,
} from "./contract.ts";
export {
  handleCreateWorkflow,
  handleDeleteRun,
  handleDeleteWorkflow,
  handleGetStepLog,
  handleGetWorkflow,
  handleListRunSteps,
  handleListRuns,
  handleListWorkflowFiles,
  handleListWorkflows,
  handleMintWsToken,
  handleReadWorkflowFile,
  handleRunEvents,
  handleRunWorkflow,
} from "./handler.ts";
export { dashboardClient, type DashboardClient, type DashboardClientOptions } from "./client.ts";

export interface DashboardStores {
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
  runs: RunStore;
}

/** Builds this module's routes, bound to `stores` — call once at startup with the process's own store instances. */
export function createDashboardFeatures(stores: DashboardStores): Feature[] {
  const { repositories, links, runs } = stores;

  return [
    {
      name: "workflow-list",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows" }),
      handle: (request) => handleListWorkflows(runs, request),
    },
    {
      name: "workflow-get",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id" }),
      handle: (request, params) => handleGetWorkflow(repositories, links, runs, request, params),
    },
    {
      name: "workflow-create",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/workflows" }),
      handle: (request) => handleCreateWorkflow(repositories, links, runs, request),
    },
    {
      name: "workflow-delete",
      method: "DELETE",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id" }),
      handle: (request, params) => handleDeleteWorkflow(links, request, params),
    },
    {
      name: "workflow-runs",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs" }),
      handle: (request, params) => handleListRuns(runs, request, params),
    },
    {
      name: "workflow-run",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/run" }),
      handle: (request, params) => handleRunWorkflow(repositories, links, runs, request, params),
    },
    {
      name: "workflow-run-steps",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/steps" }),
      handle: (request, params) => handleListRunSteps(runs, request, params),
    },
    {
      name: "workflow-run-step-log",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/steps/:jobId/:index/log" }),
      handle: (request, params) => handleGetStepLog(runs, request, params),
    },
    {
      name: "workflow-run-delete",
      method: "DELETE",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId" }),
      handle: (request, params) => handleDeleteRun(runs, request, params),
    },
    {
      name: "workflow-files-list",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/files" }),
      handle: handleListWorkflowFiles,
    },
    {
      name: "auth-ws-token",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/auth/ws-token" }),
      handle: handleMintWsToken,
    },
    {
      name: "workflow-run-events",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/events" }),
      handle: (request, params) => handleRunEvents(runs, request, params),
    },
    {
      name: "workflow-files-read",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/files/*" }),
      handle: handleReadWorkflowFile,
    },
  ];
}
