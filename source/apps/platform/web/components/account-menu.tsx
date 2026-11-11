import { useState } from "react";
import {
  DropdownContent,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
  MenuItem,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useIcon,
} from "@ritaj/ui";
import { describe, type Operator } from "../api.ts";
import { useApi } from "../api-provider.tsx";

/** Up to two letters for an operator with no picture: their name's initials, or their email's first letter. */
function initialsOf(operator: Operator): string {
  const words = (operator.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  }
  return (operator.email ?? operator.subject).slice(0, 1).toUpperCase();
}

/** The signed-in operator, pinned to the sidebar's foot, with a way to sign out. */
export function AccountMenu({ operator }: { operator: Operator }) {
  const api = useApi();
  const [error, setError] = useState<string | undefined>();
  const Chevrons = useIcon("chevrons-up-down");
  const name = operator.name ?? operator.email ?? operator.subject;

  async function signOut() {
    setError(undefined);
    try {
      const { signIn } = await api.signOut();
      location.assign(
        `${signIn}?return_to=${encodeURIComponent(location.origin)}`,
      );
    } catch (e) {
      setError(describe(e));
    }
  }

  return (
    <SidebarMenu aria-label="Account">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownTrigger
            render={
              <SidebarMenuButton size="lg" aria-label="Open account menu">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-caption font-medium text-primary-foreground">
                  {initialsOf(operator)}
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-body font-medium text-foreground">
                    {name}
                  </span>
                  {operator.email && operator.email !== name && (
                    <span className="truncate text-caption text-muted-foreground">
                      {operator.email}
                    </span>
                  )}
                </span>
                <Chevrons
                  size={16}
                  className="ml-auto shrink-0 text-muted-foreground"
                />
              </SidebarMenuButton>
            }
          />
          <DropdownContent side="top" align="start" sideOffset={6}>
            <DropdownLabel>
              {operator.role ? `Signed in as ${operator.role}` : "Signed in"}
            </DropdownLabel>
            {error && <DropdownLabel>{error}</DropdownLabel>}
            <DropdownSeparator />
            <MenuItem index={0} label="Sign out" onSelect={signOut} />
          </DropdownContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
