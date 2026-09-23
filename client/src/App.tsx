import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionProvider } from "@/hooks/use-permissions";
import AIEnabledLayout from "@/components/layout/ai-enabled-layout";
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
      <Route path="/dashboard">
        <AIEnabledLayout>
          <Dashboard />
        </AIEnabledLayout>
      </Route>
      <Route path="/analytics">
        <AIEnabledLayout>
          <Analytics />
        </AIEnabledLayout>
      </Route>
      <Route path="/email">
        <AIEnabledLayout>
          <EmailCenter />
        </AIEnabledLayout>
      </Route>
      <Route path="/email-center">
        <AIEnabledLayout>
          <EmailCenter />
        </AIEnabledLayout>
      </Route>
      <Route path="/ai-assistant">
        <AIEnabledLayout>
          <AIAssistant />
        </AIEnabledLayout>
      </Route>
      <Route path="/assistant">
        <AIEnabledLayout>
          <AIAssistant />
        </AIEnabledLayout>
      </Route>
      <Route path="/settings">
        <AIEnabledLayout>
          <Settings />
        </AIEnabledLayout>
      </Route>
      <Route path="/admin/roles">
        <AIEnabledLayout>
          <RoleManagement />
        </AIEnabledLayout>
      </Route>
      <Route path="/admin">
        <AIEnabledLayout>
          <AdminDashboard />
        </AIEnabledLayout>
      </Route>
      <Route path="/admin/dashboard">
        <AIEnabledLayout>
          <AdminDashboard />
        </AIEnabledLayout>
      </Route>
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
