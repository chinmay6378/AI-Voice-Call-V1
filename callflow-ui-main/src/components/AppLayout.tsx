import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, User, Wifi } from "lucide-react";

const titles: Record<string, { title: string; subtitle: string }> = {
  "/":              { title: "Dashboard",         subtitle: "Platform overview & performance" },
  "/campaigns":     { title: "Campaigns",          subtitle: "Manage your outbound call campaigns" },
  "/campaigns/new": { title: "Launch Campaign",    subtitle: "Configure and launch a new AI call campaign" },
  "/live":          { title: "Live Calls",         subtitle: "Monitor active calls in real time" },
  "/results":       { title: "Call Results",       subtitle: "Complete record of all outbound calls" },
  "/analytics":     { title: "Analytics",          subtitle: "Performance insights and trends" },
  "/system-health": { title: "System Health",      subtitle: "Realtime status of platform services" },
  "/settings":      { title: "Settings",           subtitle: "Platform configuration and API keys" },
};

export default function AppLayout() {
  const { pathname } = useLocation();
  const meta =
    titles[pathname] ??
    (pathname.startsWith("/call-details/") ? { title: "Call Details",     subtitle: "Full call transcript and events" } :
     pathname.startsWith("/campaigns/") ? { title: "Campaign Details", subtitle: "Campaign analytics and contacts" } :
     { title: "", subtitle: "" });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-subtle">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Top bar ── */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
            <div className="flex items-center gap-2.5 min-w-0">
              <SidebarTrigger />
              <div className="h-4 w-px bg-border" />
              <div className="min-w-0">
                <h1 className="text-sm font-semibold tracking-tight truncate leading-none">{meta.title}</h1>
                {meta.subtitle && (
                  <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5 hidden sm:block">
                    {meta.subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="hidden sm:flex items-center gap-1.5 text-[10px] border-success/30 text-success">
                <Wifi className="h-3 w-3" />
                Live
              </Badge>
              <ThemeToggle />
              <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Profile">
                <User className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* ── Page content ── */}
          <main className="flex-1 p-4 md:p-6 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
