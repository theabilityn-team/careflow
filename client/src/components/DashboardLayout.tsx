import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, ContactRound, LayoutDashboard, LogOut, PanelLeft, ScanLine, ShieldCheck, UsersRound } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const SIDEBAR_WIDTH_KEY = "careflow-sidebar-width";
const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 224;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)), [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return (
      <div className="min-h-screen overflow-hidden bg-[#f4f7f6] text-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(15,118,110,.15),transparent_28%),radial-gradient(circle_at_82%_76%,rgba(14,165,233,.11),transparent_30%)]" />
        <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <div className="mb-8 inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></div>
              <span className="font-semibold tracking-tight">CareFlow CRM</span>
            </div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.24em] text-teal-700">Secure lead operations</p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.06] tracking-[-.045em] sm:text-6xl">Turn documents into trusted customer records.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Scan multiple document images, review every extracted field, and manage the complete journey from new lead to buyer.</p>
          </div>
          <div className="rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/15">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-300"><ScanLine /></div>
            <h2 className="text-2xl font-semibold tracking-tight">Authorized staff access</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Sign in with your approved account. Clinical information is protected by role-based permissions and activity logging.</p>
            <Button onClick={() => startLogin()} size="lg" className="mt-8 w-full bg-teal-500 text-slate-950 hover:bg-teal-400">Sign in securely</Button>
            <p className="mt-5 text-center text-xs text-slate-500">Protected workspace · Staff review required</p>
          </div>
        </div>
      </div>
    );
  }
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardShell setSidebarWidth={setSidebarWidth}>{children}</DashboardShell></SidebarProvider>;
}

function DashboardShell({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const { data: access } = trpc.dashboard.access.useQuery();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/", show: true },
    { icon: ContactRound, label: "Leads", path: "/leads", show: access?.permissions.viewLeads ?? true },
    { icon: ScanLine, label: "Scan documents", path: "/scan", show: (access?.permissions.scanDocuments && access?.permissions.viewClinical) ?? false },
    { icon: ClipboardCheck, label: "Follow-ups", path: "/follow-ups", show: access?.permissions.viewLeads ?? true },
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
                return <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={selected} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl font-medium"><item.icon className="h-[18px] w-[18px]" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>;
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t border-slate-100 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-slate-50"><Avatar className="h-9 w-9 border border-slate-200"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{user?.name?.slice(0, 1).toUpperCase() ?? "U"}</AvatarFallback></Avatar>{!isCollapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.name ?? "Staff member"}</p><p className="truncate text-xs text-slate-400">{access?.jobTitle ?? "Loading access…"}</p></div>}</button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52"><DropdownMenuItem onClick={logout} className="cursor-pointer text-rose-600 focus:text-rose-600"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent>
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
    </>
  );
}
