import { NavLink, Outlet, useParams } from "react-router";
import { Tabs, TabsList, TabsTab } from "@ritaj/ui";

/** Wraps RunsView and RunDetailView so the "Runs" tab stays visible (and selected) whether you're looking at the run list or a single run's detail. */
export function RunsLayout() {
  const { workflowId = "" } = useParams();

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto">
      <Tabs value="runs" className="gap-0">
        <TabsList className="h-auto w-full justify-start gap-2 border-b px-6 py-2">
          <TabsTab
            value="runs"
            className="h-9 rounded-md border-b-0 data-[selected]:border-b-0 aria-[current=page]:border-b-0"
            render={<NavLink to={`/workflows/${workflowId}/runs`} />}
          >
            Runs
          </TabsTab>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
