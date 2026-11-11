import { useState } from "react";
import {
  Link,
  Outlet,
  useLoaderData,
  useMatch,
  useMatches,
  useNavigation,
  useParams,
} from "react-router";
import {
  cn,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarInsetTopbar,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarWorkspaceHeader,
  TooltipProvider,
  useIcon,
} from "@ritaj/ui";
import { AccountMenu } from "./components/account-menu.tsx";
import { Logo } from "./components/logo.tsx";
import * as Paths from "./paths.ts";
import type { ScreenHandle, ShellData } from "./routes.tsx";

/** The platform's frame: the sidebar, and the screen the URL points at beneath the top bar. */
export function Shell() {
  const navigation = useNavigation();
  const { operator } = useLoaderData() as ShellData;

  return (
    <TooltipProvider>
      <SidebarProvider shortcut="Ctrl+B">
        <Sidebar variant="inset">
          <SidebarHeader>
            <SidebarWorkspaceHeader
              name={<span className="font-serif text-[18px]">Ensemble</span>}
              tile={<Logo className="-ml-0.5 size-6 shrink-0" />}
            />
          </SidebarHeader>
          <SidebarContent>
            <Navigation />
            <Integrations />
          </SidebarContent>
          {operator && (
            <SidebarFooter>
              <AccountMenu operator={operator} />
            </SidebarFooter>
          )}
        </Sidebar>
        {
          /* The inset is as tall as the window, less its own 0.5rem margins, so
            the top bar stays put and only the screen beneath it scrolls. */
        }
        <SidebarInset className="h-[calc(100svh-1rem)] overflow-hidden">
          <SidebarInsetTopbar>
            <h1 className="text-title font-medium text-foreground">
              <ScreenTitle />
            </h1>
          </SidebarInsetTopbar>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              aria-busy={navigation.state === "loading" || undefined}
              className={cn(
                "mx-auto grid w-full max-w-6xl gap-6 p-4 transition-opacity duration-150 md:p-6",
                navigation.state === "loading" && "opacity-60",
              )}
            >
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

/** The top bar's title: what the deepest matched screen calls itself. */
function ScreenTitle() {
  const params = useParams();
  const handle = useMatches()
    .map((match) => match.handle as ScreenHandle | undefined)
    .findLast((handle) => handle?.title);
  return <>{handle?.title(params) ?? ""}</>;
}

/** A little air between rows, so each reads as its own target. */
const ROW_SPACING = "gap-1";

/** How many projects the sidebar lists at first, and how many more each "More" adds. */
const PROJECTS_PAGE = 5;

/** Overview, then Projects: its page, the first few projects on hover, and a way to add one. */
function Navigation() {
  const { projects } = useLoaderData() as ShellData;
  const overview = useMatch({ path: Paths.overview, end: true });
  const deployments = useMatch({ path: Paths.deployments, end: true });
  const projectsPage = useMatch({ path: Paths.projects, end: true });
  const openProject = useMatch("/projects/:id")?.params.id;
  const adding = useMatch(Paths.newProject) !== null;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [listed, setListed] = useState(PROJECTS_PAGE);
  const OverviewIcon = useIcon("home");
  const DeploymentsIcon = useIcon("rocket");
  const ProjectsIcon = useIcon("folder");
  const Chevron = useIcon("chevron-right");
  const AddIcon = useIcon("plus");
  const MoreIcon = useIcon("more-horizontal");

  // The open project stays listed, however far down it is.
  const openIndex = projects.findIndex((project) => project.id === openProject);
  const shown = projects.slice(0, Math.max(listed, openIndex + 1));
  // Open while pointed at or tabbed into, and while a project is on screen.
  const open = hovered || focused || openIndex !== -1;

  return (
    <SidebarGroup>
      <SidebarMenu className={ROW_SPACING}>
        <SidebarMenuItem>
          <SidebarMenuButton
            icon={OverviewIcon}
            isActive={overview !== null}
            render={<Link to={Paths.overview} />}
          >
            Overview
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            icon={DeploymentsIcon}
            isActive={deployments !== null}
            render={<Link to={Paths.deployments} />}
          >
            Deployments
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setFocused(false);
            }
          }}
        >
          <SidebarMenuButton
            icon={ProjectsIcon}
            isActive={projectsPage !== null}
            aria-expanded={open}
            render={<Link to={Paths.projects} />}
          >
            Projects
            <Chevron
              size={14}
              className={cn(
                "ml-auto shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-90",
              )}
            />
          </SidebarMenuButton>
          <SidebarMenuAction
            aria-label="Add a project"
            data-active={adding || undefined}
            render={<Link to={Paths.newProject} />}
          >
            <AddIcon size={16} />
          </SidebarMenuAction>
          <SidebarMenuSub open={open} className={ROW_SPACING}>
            {projects.length === 0 && (
              <li className="px-2 py-1 text-caption text-muted-foreground">
                No projects yet
              </li>
            )}
            {shown.map((project) => (
              <SidebarMenuSubItem key={project.id}>
                <SidebarMenuSubButton
                  isActive={openProject === project.id}
                  render={<Link to={Paths.project(project.id)} />}
                >
                  {project.id}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            {shown.length < projects.length && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  icon={MoreIcon}
                  render={<button type="button" />}
                  onClick={() => setListed(shown.length + PROJECTS_PAGE)}
                >
                  More
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** What the platform connects to outside: GitHub, for now. */
function Integrations() {
  const github = useMatch({ path: Paths.github, end: true });
  const GithubIcon = useIcon("link");
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Integrations</SidebarGroupLabel>
      <SidebarMenu className={ROW_SPACING}>
        <SidebarMenuItem>
          <SidebarMenuButton
            icon={GithubIcon}
            isActive={github !== null}
            render={<Link to={Paths.github} />}
          >
            GitHub
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
