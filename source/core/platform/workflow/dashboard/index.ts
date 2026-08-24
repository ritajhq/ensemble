import { DashboardHandlers, type DashboardStores } from "./handler.ts";
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
  type RenameWorkflowResponse,
  type RunWorkflowResponse,
  type WorkflowSummary,
} from "./contract.ts";
export { DashboardHandlers, type DashboardStores } from "./handler.ts";
export { client, type Client, type ClientOptions } from "./client.ts";

/** Builds this module's routes, bound to `stores` — call once at startup with the process's own store instances. */
export function createDashboardFeatures(stores: DashboardStores): Feature[] {
  const handlers = new DashboardHandlers(stores);

  return [
    {
      name: "workflow-list",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows" }),
      handle: (request) => handlers.handleListWorkflows(request),
    },
    {
      name: "workflow-get",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id" }),
      handle: (request, params) => handlers.handleGetWorkflow(request, params),
    },
    {
      name: "workflow-create",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/workflows" }),
      handle: (request) => handlers.handleCreateWorkflow(request),
    },
    {
      name: "workflow-delete",
      method: "DELETE",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id" }),
      handle: (request, params) =>
        handlers.handleDeleteWorkflow(request, params),
    },
    {
      name: "workflow-rename",
      method: "PATCH",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id" }),
      handle: (request, params) =>
        handlers.handleRenameWorkflow(request, params),
    },
    {
      name: "workflow-runs",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs" }),
      handle: (request, params) => handlers.handleListRuns(request, params),
    },
    {
      name: "workflow-run",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/run" }),
      handle: (request, params) => handlers.handleRunWorkflow(request, params),
    },
    {
      name: "workflow-run-steps",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/steps" }),
      handle: (request, params) =>
        handlers.handleListRunSteps(request, params),
    },
    {
      name: "workflow-run-step-log",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/steps/:jobId/:index/log" }),
      handle: (request, params) => handlers.handleGetStepLog(request, params),
    },
    {
      name: "workflow-run-delete",
      method: "DELETE",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId" }),
      handle: (request, params) => handlers.handleDeleteRun(request, params),
    },
    {
      name: "workflow-files-list",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/files" }),
      handle: (request, params) =>
        handlers.handleListWorkflowFiles(request, params),
    },
    {
      name: "auth-ws-token",
      method: "POST",
      pattern: new URLPattern({ pathname: "/v1/auth/ws-token" }),
      handle: (request) => handlers.handleMintWsToken(request),
    },
    {
      name: "workflow-run-events",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/runs/:runId/events" }),
      handle: (request, params) => handlers.handleRunEvents(request, params),
    },
    {
      name: "workflow-files-read",
      method: "GET",
      pattern: new URLPattern({ pathname: "/v1/workflows/:id/files/*" }),
      handle: (request, params) =>
        handlers.handleReadWorkflowFile(request, params),
    },
  ];
}
