import { Outlet } from "react-router";
import { AppSidebar } from "./components/AppSidebar.tsx";
import { Breadcrumbs } from "./components/Breadcrumbs.tsx";
import { SidebarInset, SidebarProvider } from "@ritaj/ui";

export function App() {
  return (
    <SidebarProvider className="h-dvh min-h-0">
      <AppSidebar />
      <SidebarInset className="min-h-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Breadcrumbs />
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
