import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import NotFound from "@/pages/not-found";
import Home from "./pages/Home";
import Chalets from "./pages/Chalets";
import ChaletDetail from "./pages/ChaletDetail";
import AddChalet from "./pages/AddChalet";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Services from "./pages/Services";
import ServiceDetail from "./pages/ServiceDetail";
import { FloatingWhatsApp } from "@/components/layout/FloatingWhatsApp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ component: Component, returnTo }: { component: React.ComponentType; returnTo?: string }) {
  const { isAuthenticated, isLoading, login } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login(returnTo);
    }
  }, [isLoading, isAuthenticated, login, returnTo]);

  if (isLoading) return null;
  if (!isAuthenticated) return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/chalets" component={Chalets} />
      <Route path="/chalets/:id" component={ChaletDetail} />
      <Route path="/add-chalet" component={AddChalet} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/admin" component={Admin} />
      <Route path="/services" component={Services} />
      <Route path="/services/:id" component={ServiceDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
        <FloatingWhatsApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
