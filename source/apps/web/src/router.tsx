import { GitBranch, Workflow as WorkflowIcon } from "lucide-react";
import { createBrowserRouter, Outlet, redirect } from "react-router";
import { App } from "./App.tsx";
import { GitIntegrationDetailView } from "./components/GitIntegrationDetailView.tsx";
import { GitIntegrationView } from "./components/GitIntegrationView.tsx";
import { RunDetailView } from "./components/RunDetailView.tsx";
import { RunsLayout } from "./components/RunsLayout.tsx";
import { RunsView } from "./components/RunsView.tsx";
import { SecretsView } from "./components/SecretsView.tsx";
import { WorkflowsView } from "./components/WorkflowsView.tsx";
import { decodeWorkflowId } from "./lib/workflow-id.ts";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      {
        index: true,
        loader: () => redirect("/workflows"),
      },
      {
        path: "workflows",
        handle: { crumb: () => ({ title: "Workflows", icon: WorkflowIcon }) },
        Component: Outlet,
        children: [
          { index: true, Component: WorkflowsView },
          {
            path: ":workflowId",
            handle: {
              crumb: (params: Record<string, string | undefined>) => ({
                title: params.workflowId
                  ? decodeWorkflowId(params.workflowId)
                  : "",
                icon: WorkflowIcon,
              }),
            },
            Component: Outlet,
            children: [
              {
                index: true,
                loader: ({ params }) =>
                  redirect(`/workflows/${params.workflowId}/runs`),
              },
              {
                Component: RunsLayout,
                children: [
                  { path: "runs", Component: RunsView },
                  { path: "runs/:runId", Component: RunDetailView },
                  { path: "secrets", Component: SecretsView },
                ],
              },
            ],
          },
        ],
      },
      {
        path: "integrations/git",
        handle: { crumb: () => ({ title: "Git", icon: GitBranch }) },
        Component: Outlet,
        children: [
          { index: true, Component: GitIntegrationView },
          {
            path: ":projectName",
            handle: {
              crumb: (params: Record<string, string | undefined>) => ({
                title: params.projectName
                  ? decodeURIComponent(params.projectName)
                  : "",
                icon: GitBranch,
              }),
            },
            Component: GitIntegrationDetailView,
          },
        ],
      },
    ],
  },
]);
