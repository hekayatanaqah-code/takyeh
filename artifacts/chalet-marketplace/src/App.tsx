import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Toaster } from "@/components/ui/toaster";
import AppStatus from "@/components/AppStatus";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import NotFound from "@/pages/not-found";
import Home from "./pages/Home";
import Chalets from "./pages/Chalets";
import ChaletDetail from "./pages/ChaletDetail";
import ChaletMasterView from "./pages/ChaletMasterView";
import ChaletBooking from "./pages/ChaletBooking";
import AddChalet from "./pages/AddChalet";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Services from "./pages/Services";
import ServiceDetail from "./pages/ServiceDetail";
import AddServiceProvider from "./pages/AddServiceProvider";
import ProviderDetail from "./pages/ProviderDetail";
import About from "./pages/About";
import FAQ from "./pages/FAQ";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import ContactUs from "./pages/ContactUs";
import SubscriptionPage from "./pages/SubscriptionPage";
import AddonCheckoutPage from "./pages/AddonCheckoutPage";
import RatePage from "./pages/RatePage";
import ContractPage from "./pages/ContractPage";
import ServiceContractPage from "./pages/ServiceContractPage";
import OwnerChaletDetail from "./pages/OwnerChaletDetail";
import Login from "./pages/Login";
import AdminPortal from "./pages/AdminPortal";
import Register from "./pages/Register";
import Verify from "./pages/Verify";
import VerifyPhone from "./pages/VerifyPhone";
import OnboardingType from "./pages/OnboardingType";
import OnboardingWelcome from "./pages/OnboardingWelcome";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DualCalendarPickerTestPage from "./pages/DualCalendarPickerTestPage";
import PhotographerPortal, { PhotographerInvite } from "./features/photography/PhotographerPortal";

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
      {import.meta.env.DEV && (
        <Route path="/__test/dual-calendar" component={DualCalendarPickerTestPage} />
      )}
      <Route path="/" component={Home} />
      <Route path="/chalets" component={Chalets} />
      <Route path="/chalets/:id/book" component={ChaletBooking} />
      <Route path="/chalets/:id" component={ChaletDetail} />
      <Route path="/add-chalet" component={AddChalet} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/my-chalet/:id">
        {() => <ProtectedRoute component={OwnerChaletDetail} />}
      </Route>
      <Route path="/admin" component={Admin} />
      <Route path="/photographer/invite/:token" component={PhotographerInvite} />
      <Route path="/photographer" component={PhotographerPortal} />
      <Route path="/services" component={Services} />
      <Route path="/services/:id" component={ServiceDetail} />
      <Route path="/add-service-provider">
        {() => <ProtectedRoute component={AddServiceProvider} returnTo="/add-service-provider" />}
      </Route>
      <Route path="/providers/:id" component={ProviderDetail} />
      <Route path="/subscription">
        {() => <ProtectedRoute component={SubscriptionPage} returnTo="/subscription" />}
      </Route>
      <Route path="/addon-payment">
        {() => <ProtectedRoute component={AddonCheckoutPage} returnTo={`/addon-payment${window.location.search}`} />}
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/staff-login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify" component={Verify} />
      <Route path="/verify-phone" component={VerifyPhone} />
      <Route path="/onboarding/type" component={OnboardingType} />
      <Route path="/onboarding/welcome" component={OnboardingWelcome} />
      <Route path="/forgot-password">{() => <ForgotPassword portalType="public" />}</Route>
      <Route path="/forgot-password/admin">{() => <ForgotPassword portalType="admin" />}</Route>
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/admin-login" component={AdminPortal} />
      <Route path="/r/:token" component={RatePage} />
      <Route path="/contract/:bookingId" component={ContractPage} />
      <Route path="/service-contract/:appointmentId" component={ServiceContractPage} />
      <Route path="/about" component={About} />
      <Route path="/faq" component={FAQ} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/contact" component={ContactUs} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Western digit → Arabic-Indic digit map */
const AR_DIGIT: Record<string, string> = {
  '0':'٠','1':'١','2':'٢','3':'٣','4':'٤',
  '5':'٥','6':'٦','7':'٧','8':'٨','9':'٩',
};

/** Input types where we must NOT intercept digits */
const SKIP_TYPES = new Set([
  'password','email','url','hidden','file',
  'range','color','date','time','datetime-local',
  'month','week','number','search',
]);

function useArabicDigitInput() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ar = AR_DIGIT[e.key];
      if (!ar) return;

      const el = e.target as HTMLElement;
      const tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;

      const input = el as HTMLInputElement | HTMLTextAreaElement;
      if (SKIP_TYPES.has((input as HTMLInputElement).type)) return;
      if (input.readOnly || input.disabled) return;
      if (el.dataset.noArabic) return;

      e.preventDefault();

      const start = input.selectionStart ?? input.value.length;
      const end   = input.selectionEnd   ?? input.value.length;
      const before = input.value.slice(0, start);
      const after  = input.value.slice(end);
      const newVal = before + ar + after;
      const newPos = start + ar.length;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        tag === 'INPUT'
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(input, newVal);
        input.setSelectionRange(newPos, newPos);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

function App() {
  useArabicDigitInput();

  useEffect(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppStatus />
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
