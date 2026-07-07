import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PhoneCall, Activity, Settings,
  Megaphone, Rocket, Radio, BarChart3, PhoneForwarded, PhoneIncoming,
  Building2, ChevronDown,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Platform",
    items: [
      { title: "Dashboard",        url: "/",              icon: LayoutDashboard, exact: true },
      { title: "Campaigns",        url: "/campaigns",     icon: Megaphone },
      { title: "Launch Campaign",  url: "/campaigns/new", icon: Rocket },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Live Calls",    url: "/live",      icon: Radio },
      { title: "Inbound",       url: "/inbound",   icon: PhoneIncoming },
      { title: "Call Results",  url: "/results",   icon: PhoneForwarded },
      { title: "Analytics",     url: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Health",    url: "/health",   icon: Activity },
      { title: "Settings",  url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      {/* ── Brand header ── */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-elegant">
            <Building2 className="h-4.5 w-4.5 text-primary-foreground" style={{ height: "18px", width: "18px" }} />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-tight truncate">Smart Acquisition</span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Solutions Platform</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent className="px-1 py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="mb-1">
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-[0.12em]">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.url, item.exact);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={cn(
                          "rounded-lg transition-all",
                          active && "bg-primary/10 text-primary font-medium",
                        )}
                      >
                        <NavLink
                          to={item.url}
                          end={item.exact}
                          className="flex items-center gap-2.5"
                        >
                          <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ── Footer ── */}
      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
              SA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">Admin User</p>
              <p className="text-[10px] text-muted-foreground truncate">admin@smartacq.com</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
