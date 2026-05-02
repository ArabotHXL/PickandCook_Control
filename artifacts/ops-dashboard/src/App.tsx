import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import { LoginPage } from "@/pages/LoginPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { UsersPage } from "@/pages/UsersPage";
import { PantryPage } from "@/pages/PantryPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { RecipesPage } from "@/pages/RecipesPage";
import { ModerationPage } from "@/pages/ModerationPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { SystemPage } from "@/pages/SystemPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppRoutes() {
  const { user, loading, login, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={login} />;
  }

  return (
    <Layout user={user} onLogout={logout}>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/users" component={UsersPage} />
        <Route path="/pantry" component={PantryPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/recipes" component={RecipesPage} />
        <Route path="/moderation" component={ModerationPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/system" component={SystemPage} />
        <Route path="/audit" component={AuditLogPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
