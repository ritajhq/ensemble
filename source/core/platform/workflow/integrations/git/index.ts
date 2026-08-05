import {
  handleCloneGitWorkflows,
  handleListGitRepositories,
  handleRefreshGitRepository,
  handleRemoveGitRepository,
  handleRemoveGitRepositoryWorkflow,
  handleRestoreGitRepositoryWorkflow,
} from "./handler.ts";
import type { Feature } from "../../../features.ts";

export {
  handleCloneGitWorkflows,
  handleListGitRepositories,
  handleRefreshGitRepository,
  handleRemoveGitRepository,
  handleRemoveGitRepositoryWorkflow,
  handleRestoreGitRepositoryWorkflow,
} from "./handler.ts";
export type {
  CloneGitWorkflowsRequest,
  CloneGitWorkflowsResponse,
  GitRepositorySummary,
  GitWorkflowSummary,
  ListGitRepositoriesResponse,
  RefreshGitRepositoryResponse,
} from "./contract.ts";

export const gitIntegrationCloneFeature: Feature = {
  name: "git-integration-clone",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/integrations/git/clone" }),
  handle: handleCloneGitWorkflows,
};

export const gitIntegrationListRepositoriesFeature: Feature = {
  name: "git-integration-repositories-list",
  method: "GET",
  pattern: new URLPattern({ pathname: "/v1/integrations/git/repositories" }),
  handle: handleListGitRepositories,
};

export const gitIntegrationRefreshRepositoryFeature: Feature = {
  name: "git-integration-repository-refresh",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/integrations/git/repositories/:projectName/refresh" }),
  handle: handleRefreshGitRepository,
};

export const gitIntegrationRemoveRepositoryFeature: Feature = {
  name: "git-integration-repository-remove",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/integrations/git/repositories/:projectName/remove" }),
  handle: handleRemoveGitRepository,
};

export const gitIntegrationRemoveWorkflowFeature: Feature = {
  name: "git-integration-repository-workflow-remove",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/integrations/git/repositories/:projectName/workflows/:workflowName/remove" }),
  handle: handleRemoveGitRepositoryWorkflow,
};

export const gitIntegrationRestoreWorkflowFeature: Feature = {
  name: "git-integration-repository-workflow-restore",
  method: "POST",
  pattern: new URLPattern({ pathname: "/v1/integrations/git/repositories/:projectName/workflows/:workflowName/restore" }),
  handle: handleRestoreGitRepositoryWorkflow,
};
