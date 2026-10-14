import { type ReactNode, useEffect, useState } from "react";
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
import { Welcome } from "./screens/welcome.tsx";

/** Where the URL's hash points: `#/projects/<id>`, `#/new`, or nowhere yet. */
type Place =
  | { readonly kind: "welcome" }
  | { readonly kind: "new" }
  | { readonly kind: "project"; readonly id: string };

function placeOf(hash: string): Place {
  const project = /^#\/projects\/([^/]+)$/.exec(hash);
  if (project) return { kind: "project", id: decodeURIComponent(project[1]) };
  if (hash === "#/new") return { kind: "new" };
  return { kind: "welcome" };
}

/** The place the URL's hash names, following it as it changes. */
function usePlace(): Place {
  const [place, setPlace] = useState(() => placeOf(location.hash));
  useEffect(() => {
    const onHash = () => setPlace(placeOf(location.hash));
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return place;
}

function go(hash: string): void {
  location.hash = hash;
}

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
          go(`#/projects/${encodeURIComponent(id)}`);
        }}
      />
    ),
  }),
  project: ({ id }) => ({
    title: id,
    body: <ProjectScreen key={id} id={id} />,
  }),
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
                        go(`#/projects/${encodeURIComponent(project.id)}`)}
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
