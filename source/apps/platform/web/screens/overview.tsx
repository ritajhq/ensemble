import { useLoaderData } from "react-router";
import { Notice } from "../components/notice.tsx";
import { Panel } from "../components/panel.tsx";
import type { OverviewData } from "../routes.tsx";

/** The platform at a glance: the GitHub App it acts as, what it is for, and what its router routes. */
export function Overview() {
  const { table } = useLoaderData() as OverviewData;
  const { routes } = table;

  return (
    <>
      <Panel
        title="Release and deploy ensemble projects"
        description="Pick a project in the sidebar, or add one: a GitHub repository with delivery manifests under ci/."
      />
      <Panel
        title="Routes"
        description="Every host the router answers, and the deployment it goes to: what each applied deploy recorded."
      >
        {table.conflicts.map((conflict) => (
          <Notice
            key={conflict.host}
            tone="warning"
            details={`Claimed by ${conflict.owners.join(", ")}; it goes to ${
              conflict.owners[0]
            }.`}
          >
            {conflict.host} is claimed twice
          </Notice>
        ))}
        {table.rejections.map((rejection) => (
          <Notice
            key={`${rejection.owner} ${rejection.value}`}
            tone="error"
            details={`${rejection.owner} recorded it; it isn't routed.`}
          >
            "{rejection.value}" can't be routed
          </Notice>
        ))}
        {routes.length === 0 && (
          <p className="text-body text-muted-foreground">Nothing routed yet</p>
        )}
        {routes.length > 0 && (
          <div className="grid gap-1">
            {routes.map((route) => (
              <div
                key={route.host}
                className="flex flex-wrap items-center gap-2 text-body"
              >
                <span className="font-mono text-caption">{route.host}</span>
                <span className="text-muted-foreground">→ {route.owner}</span>
                <span className="ml-auto font-mono text-caption text-muted-foreground">
                  {route.upstream.scheme}://{route.upstream.alias}:{route
                    .upstream.port}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
