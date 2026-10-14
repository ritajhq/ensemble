import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarInsetTopbar,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarWorkspaceHeader,
  TooltipProvider,
  useIcon,
  WorkspaceTile,
} from "@ritaj/ui";
import { useApi } from "./api-provider.tsx";
import { useLoad } from "./use-load.ts";
import { AddProject } from "./screens/add-project.tsx";
import { ProjectScreen } from "./screens/project.tsx";
import { RunScreen } from "./screens/run.tsx";
import { Welcome } from "./screens/welcome.tsx";
import { go, type Place, projectHash, usePlace } from "./places.ts";

/** What each place shows, with its title in the top bar. */
const SCREENS: {
  readonly [K in Place["kind"]]: (
    place: Extract<Place, { kind: K }>,
    onProjectsChanged: () => void,
  ) => { title: string; body: ReactNode };
} = {
  welcome: () => ({ title: "Projects", body: <Welcome /> }),
  new: (_, onProjectsChanged) => ({
    title: "Add a project",
    body: (
      <AddProject
        onAdded={(id) => {
          onProjectsChanged();
          go(projectHash(id));
        }}
      />
    ),
  }),
  project: ({ id }) => ({
    title: id,
    body: <ProjectScreen key={id} id={id} />,
  }),
  run: ({ id }) => ({ title: "Run", body: <RunScreen key={id} id={id} /> }),
};

/** The platform: its projects in the sidebar, and the screen the URL points at. */
export function App() {
  const api = useApi();
  const place = usePlace();
  const projects = useLoad(() => api.projects(), []);
  const ProjectIcon = useIcon("folder");
  const AddIcon = useIcon("plus");

  const screen = (SCREENS[place.kind] as (
    place: Place,
    onProjectsChanged: () => void,
  ) => { title: string; body: ReactNode })(place, projects.reload);

  return (
    <TooltipProvider>
      <SidebarProvider peek="hover">
        <Sidebar variant="inset">
          <SidebarHeader>
            <SidebarWorkspaceHeader
              name="ensemble"
              tile={<WorkspaceTile>E</WorkspaceTile>}
            />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarMenu>
                {(projects.value ?? []).map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      icon={ProjectIcon}
                      isActive={place.kind === "project" &&
                        place.id === project.id}
                      onClick={() =>
                        go(projectHash(project.id))}
                    >
                      {project.id}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  icon={AddIcon}
                  isActive={place.kind === "new"}
                  onClick={() => go("#/new")}
                >
                  Add a project
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <SidebarInsetTopbar>
            <h1 className="text-title font-medium text-foreground">
              {screen.title}
            </h1>
          </SidebarInsetTopbar>
          <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 md:p-6">
            {screen.body}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
