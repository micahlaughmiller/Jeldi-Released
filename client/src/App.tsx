import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionProvider } from "@/hooks/use-permissions";
import Dashboard from "@/pages/dashboard";
import Login from "@/pages/login";
import EmailCenter from "@/pages/email-center";
import DemoPage from "@/pages/demo";
import Settings from "@/pages/settings";
import AIAssistant from "@/pages/ai-assistant";
import Analytics from "@/pages/analytics";
import NotFound from "@/pages/not-found";
import RoleManagement from "@/pages/role-management";
import AdminDashboard from "@/pages/admin-dashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/demo" component={DemoPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/email" component={EmailCenter} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/assistant" component={AIAssistant} />
      <Route path="/settings" component={Settings} />
      <Route path="/admin/roles" component={RoleManagement} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PermissionProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </PermissionProvider>
    </QueryClientProvider>
  );
}

export default App;
