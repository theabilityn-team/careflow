import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import BulkImageImport from "@/pages/BulkImageImport";
import EmailSettings from "@/pages/EmailSettings";
import FollowUps from "@/pages/FollowUps";
import Home from "@/pages/Home";
import Invite from "@/pages/Invite";
import LeadDetail from "@/pages/LeadDetail";
import LeadGroups from "@/pages/LeadGroups";
import Leads from "@/pages/Leads";
import Mails from "@/pages/Mails";
import NotFound from "@/pages/NotFound";
import ResetPassword from "@/pages/ResetPassword";
import Scanner from "@/pages/Scanner";
import Staff from "@/pages/Staff";
import SystemGuide from "@/pages/SystemGuide";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function DashboardPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return <Switch>
    <Route path="/invite/:token" component={Invite} />
    <Route path="/reset-password/:token" component={ResetPassword} />
    <Route path="/"><DashboardPage><Home /></DashboardPage></Route>
    <Route path="/leads"><DashboardPage><Leads /></DashboardPage></Route>
    <Route path="/leads/:id"><DashboardPage><LeadDetail /></DashboardPage></Route>
    <Route path="/groups"><DashboardPage><LeadGroups /></DashboardPage></Route>
    <Route path="/groups/:id"><DashboardPage><LeadGroups /></DashboardPage></Route>
    <Route path="/scan"><DashboardPage><Scanner /></DashboardPage></Route>
    <Route path="/bulk-import"><DashboardPage><BulkImageImport /></DashboardPage></Route>
    <Route path="/mails"><DashboardPage><Mails /></DashboardPage></Route>
    <Route path="/email-settings"><DashboardPage><EmailSettings /></DashboardPage></Route>
    <Route path="/follow-ups"><DashboardPage><FollowUps /></DashboardPage></Route>
    <Route path="/guide"><DashboardPage><SystemGuide /></DashboardPage></Route>
    <Route path="/staff"><DashboardPage><Staff /></DashboardPage></Route>
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
