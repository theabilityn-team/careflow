import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, ClipboardCheck, ContactRound, Files, FolderKanban, KeyRound, LayoutDashboard, LogOut, Mail, PanelLeft, ScanLine, UsersRound } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import ChangeSuperAdminPasswordDialog from "./ChangeSuperAdminPasswordDialog";
import LoginScreen from "./LoginScreen";

const SIDEBAR_WIDTH_KEY = "careflow-sidebar-width";
const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 224;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)), [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <LoginScreen />;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardShell setSidebarWidth={setSidebarWidth}>{children}</DashboardShell></SidebarProvider>;
}

function DashboardShell({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const { data: access } = trpc.dashboard.access.useQuery();
  const { data: notifications = [] } = trpc.dashboard.notifications.useQuery(undefined, { enabled: Boolean(access?.permissions.viewLeads) });
  const unreadDue = notifications.filter(item => !item.readAt && item.remindAt <= Date.now()).length;
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/", show: true },
    { icon: ContactRound, label: "Leads", path: "/leads", show: access?.permissions.viewLeads ?? true },
    { icon: FolderKanban, label: "Lead groups", path: "/groups", show: access?.permissions.viewLeads ?? true },
    { icon: ScanLine, label: "Add lead from images", path: "/scan", show: (access?.permissions.scanDocuments && access?.permissions.viewClinical) ?? false },
    { icon: Files, label: "Bulk image import", path: "/bulk-import", show: (access?.permissions.scanDocuments && access?.permissions.viewClinical) ?? false },
    { icon: ClipboardCheck, label: "Follow-ups", path: "/follow-ups", show: access?.permissions.viewLeads ?? true },
    { icon: Mail, label: "Email settings", path: "/email-settings", show: access?.role === "technical_staff" },
    { icon: BookOpenCheck, label: "System guide", path: "/guide", show: true },
    { icon: UsersRound, label: "Staff & access", path: "/staff", show: access?.role === "super_admin" },
  ].filter(item => item.show);
  const active = menuItems.find(item => item.path === "/" ? location === "/" : location.startsWith(item.path));

  useEffect(() => {
    if (!isResizing) return;
    const move = (event: MouseEvent) => {
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const up = () => setIsResizing(false);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" className="border-r border-slate-200/80 bg-white" disableTransition={isResizing}>
          <SidebarHeader className="h-[76px] justify-center border-b border-slate-100 px-3">
            <div className="flex w-full items-center gap-3">
              <button onClick={toggleSidebar} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white transition-transform active:scale-[.97]" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4" /></button>
              {!isCollapsed && <div className="min-w-0"><div className="font-semibold tracking-tight">CareFlow</div><div className="text-[11px] font-medium uppercase tracking-[.16em] text-slate-400">Customer intelligence</div></div>}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2 py-4">
            <SidebarMenu>
              {menuItems.map(item => {
                const selected = item.path === "/" ? location === "/" : location.startsWith(item.path);
                return <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={selected} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl font-medium"><item.icon className="h-[18px] w-[18px]" /><span>{item.label}</span>{item.path === "/follow-ups" && unreadDue > 0 && !isCollapsed && <Badge className="ml-auto h-5 min-w-5 justify-center bg-amber-300 px-1.5 text-[10px] text-slate-950 hover:bg-amber-300">{unreadDue}</Badge>}</SidebarMenuButton></SidebarMenuItem>;
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t border-slate-100 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-slate-50"><Avatar className="h-9 w-9 border border-slate-200"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{user?.name?.slice(0, 1).toUpperCase() ?? "U"}</AvatarFallback></Avatar>{!isCollapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.name ?? "Staff member"}</p><p className="truncate text-xs text-slate-400">{access?.jobTitle ?? "Loading access…"}</p></div>}</button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">{access?.role === "super_admin" && <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)} className="cursor-pointer"><KeyRound className="mr-2 h-4 w-4" />Change admin password</DropdownMenuItem>}<DropdownMenuItem onClick={logout} className="cursor-pointer text-rose-600 focus:text-rose-600"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} />
      </div>
      <SidebarInset className="bg-[#f6f8f7]">
        {isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-white/90 px-3 backdrop-blur"><SidebarTrigger /><span className="font-medium">{active?.label ?? "CareFlow"}</span></div>}
        {!access?.isActive && <div className="m-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">Your account is awaiting Super Admin approval. CRM data is not available yet.</div>}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
      {access?.role === "super_admin" && <ChangeSuperAdminPasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />}
    </>
  );
}
