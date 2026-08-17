import { NavLink, Outlet, useLocation, useParams } from "react-router";
import { Tabs, TabsList, TabsTab } from "@ritaj/ui";

/** Wraps RunsView/RunDetailView/SecretsView so a workflow's own tab bar (Runs, Secrets) stays visible and selected regardless of which one is showing. */
export function RunsLayout() {
  const { workflowId = "" } = useParams();
  const { pathname } = useLocation();
  const activeTab = pathname.endsWith("/secrets") ? "secrets" : "runs";

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto">
      <Tabs value={activeTab} className="gap-0">
        <TabsList className="h-auto w-full justify-start gap-2 border-b px-6 py-2">
          <TabsTab
            value="runs"
            className="h-9 rounded-md border-b-0 data-[selected]:border-b-0 aria-[current=page]:border-b-0"
            render={<NavLink to={`/workflows/${workflowId}/runs`} />}
          >
            Runs
          </TabsTab>
          <TabsTab
            value="secrets"
            className="h-9 rounded-md border-b-0 data-[selected]:border-b-0 aria-[current=page]:border-b-0"
            render={<NavLink to={`/workflows/${workflowId}/secrets`} />}
          >
            Secrets
          </TabsTab>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
