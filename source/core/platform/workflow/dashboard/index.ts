import { DashboardHandlers, type DashboardStores } from "./handler.ts";
import { route, type Feature } from "../../features.ts";

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

export interface DashboardRoutePaths {
  /** Base path for the /v1/workflows resource family (also the ws_token cookie's scope — see DashboardHandlers). */
  basePath: string;
  /** Path for the auth/ws-token exchange endpoint. */
  authPath: string;
}

/** Builds this module's routes, bound to `stores` — call once at startup with the process's own store instances. */
export function createDashboardFeatures(stores: DashboardStores, paths: DashboardRoutePaths): Feature[] {
  const handlers = new DashboardHandlers(stores, paths.basePath);
  const { basePath } = paths;

  return [
    route("workflow-list", "GET", basePath, (request) => handlers.handleListWorkflows(request)),
    route("workflow-get", "GET", `${basePath}/:id`, (request, params) => handlers.handleGetWorkflow(request, params)),
    route("workflow-create", "POST", basePath, (request) => handlers.handleCreateWorkflow(request)),
    route("workflow-delete", "DELETE", `${basePath}/:id`, (request, params) => handlers.handleDeleteWorkflow(request, params)),
    route("workflow-rename", "PATCH", `${basePath}/:id`, (request, params) => handlers.handleRenameWorkflow(request, params)),
    route("workflow-runs", "GET", `${basePath}/:id/runs`, (request, params) => handlers.handleListRuns(request, params)),
    route("workflow-run", "POST", `${basePath}/:id/run`, (request, params) => handlers.handleRunWorkflow(request, params)),
    route("workflow-run-steps", "GET", `${basePath}/:id/runs/:runId/steps`, (request, params) => handlers.handleListRunSteps(request, params)),
    route("workflow-run-step-log", "GET", `${basePath}/:id/runs/:runId/steps/:jobId/:index/log`, (request, params) => handlers.handleGetStepLog(request, params)),
    route("workflow-run-delete", "DELETE", `${basePath}/:id/runs/:runId`, (request, params) => handlers.handleDeleteRun(request, params)),
    route("workflow-files-list", "GET", `${basePath}/:id/files`, (request, params) => handlers.handleListWorkflowFiles(request, params)),
    route("auth-ws-token", "POST", paths.authPath, (request) => handlers.handleMintWsToken(request)),
    route("workflow-run-events", "GET", `${basePath}/:id/runs/:runId/events`, (request, params) => handlers.handleRunEvents(request, params)),
    route("workflow-files-read", "GET", `${basePath}/:id/files/*`, (request, params) => handlers.handleReadWorkflowFile(request, params)),
  ];
}
