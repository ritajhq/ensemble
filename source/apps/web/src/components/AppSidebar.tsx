import { ChevronRight, GitBranch, Workflow } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { ensembleLogo } from "../assets/ensemble-logo.ts";
import { getToken, setToken } from "../lib/api.ts";
import { usePinnedWorkflows } from "../lib/pins.ts";
import { encodeWorkflowId } from "../lib/workflow-id.ts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@ritaj/ui";

export function AppSidebar() {
  const pinned = usePinnedWorkflows();
  const location = useLocation();
  const activeWorkflowId = location.pathname.match(/^\/workflows\/([^/]+)/)?.[1] ?? "";
  const [token, setTokenState] = useState(getToken());

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center gap-2 px-3 py-2">
        <img src={ensembleLogo} alt="" className="size-5 shrink-0" />
        <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
          Ensemble
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            <Collapsible defaultOpen className="group/collapsible">
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to="/workflows" />}
                  isActive={location.pathname.startsWith("/workflows")}
                  tooltip="Workflows"
                >
                  <Workflow />
                  <span>Workflows</span>
                </SidebarMenuButton>
                <CollapsibleTrigger
                  render={<SidebarMenuAction className="group-data-[collapsible=icon]:hidden" />}
                >
                  <ChevronRight className="transition-transform duration-200 group-data-panel-open/collapsible:rotate-90" />
                  <span className="sr-only">Toggle pinned workflows</span>
                </CollapsibleTrigger>
              </SidebarMenuItem>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {pinned.length === 0
                    ? (
                      <li className="px-2 py-1.5 text-xs text-muted-foreground">
                        Pin a workflow to see it here.
                      </li>
                    )
                    : pinned.map((name) => (
                      <SidebarMenuSubItem key={name}>
                        <SidebarMenuSubButton
                          render={<NavLink to={`/workflows/${encodeWorkflowId(name)}`} />}
                          isActive={encodeWorkflowId(name) === activeWorkflowId}
                        >
                          <span>{name}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Integrations</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<NavLink to="/integrations/git" />}
                isActive={location.pathname === "/integrations/git"}
                tooltip="Git"
              >
                <GitBranch />
                <span>Git</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-1 px-3 py-2 group-data-[collapsible=icon]:hidden">
        <label className="text-xs text-muted-foreground">API token</label>
        <Input
          type="password"
          value={token}
          onChange={(event) => {
            setTokenState(event.target.value);
            setToken(event.target.value);
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
