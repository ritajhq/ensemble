import { Link, useRouteLoaderData } from "react-router";
import { Button, useIcon } from "@ritaj/ui";
import { Panel } from "../components/panel.tsx";
import { SyncBadge } from "../components/sync-badge.tsx";
import * as Paths from "../paths.ts";
import { SHELL_ROUTE, type ShellData } from "../routes.tsx";

/** Every project, each with where it comes from and how its last sync went. */
export function Projects() {
  const { projects } = useRouteLoaderData(SHELL_ROUTE) as ShellData;
  const AddIcon = useIcon("plus");

  return (
    <Panel
      title="Projects"
      description="Each a GitHub repository whose delivery manifests the platform releases and deploys."
      action={
        <Button
          variant="secondary"
          leadingIcon={AddIcon}
          render={<Link to={Paths.newProject} />}
        >
          Add a project
        </Button>
      }
    >
      {projects.length === 0 && (
        <p className="text-body text-muted-foreground">
          No projects yet: add one to release and deploy it from here.
        </p>
      )}
      {projects.length > 0 && (
        <div className="grid gap-1">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={Paths.project(project.id)}
              className="flex flex-wrap items-center gap-2 rounded-md px-2 py-2 text-body hover:bg-accent"
            >
              <span className="font-medium">{project.id}</span>
              <span className="text-muted-foreground">
                {project.repository} · {project.ref}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {project.sync && <SyncBadge state={project.sync.state} />}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
