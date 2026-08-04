import { createBrowserRouter, Outlet, redirect } from "react-router";
import { App } from "./App.tsx";
import { GitIntegrationView } from "./components/GitIntegrationView.tsx";
import { RunsView } from "./components/RunsView.tsx";
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
        handle: { crumb: () => ({ title: "Workflows" }) },
        Component: Outlet,
        children: [
          { index: true, Component: WorkflowsView },
          {
            path: ":workflowId",
            handle: {
              crumb: (params: Record<string, string | undefined>) => ({
                title: params.workflowId ? decodeWorkflowId(params.workflowId) : "",
              }),
            },
            Component: RunsView,
          },
        ],
      },
      {
        path: "integrations/git",
        handle: { crumb: () => ({ title: "Git" }) },
        Component: GitIntegrationView,
      },
    ],
  },
]);
