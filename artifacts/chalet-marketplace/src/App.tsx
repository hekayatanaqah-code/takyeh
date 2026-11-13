import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Toaster } from "@/components/ui/toaster";
import AppStatus from "@/components/AppStatus";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { lazyRoute } from "@/lib/lazy-route";
import Home from "./pages/Home";
import ForgotPassword from "./pages/ForgotPassword";

// Keep home ready at boot; every other page downloads only when its route renders.
// Module-scope identities ensure normal rerenders never reset a page or its forms.
const NotFound = lazyRoute("pages/not-found", () => import("./pages/not-found"));
const Chalets = lazyRoute("pages/Chalets", () => import("./pages/Chalets"));
const ChaletDetail = lazyRoute("pages/ChaletDetail", () => import("./pages/ChaletDetail"));
const ChaletBooking = lazyRoute("pages/ChaletBooking", () => import("./pages/ChaletBooking"));
const AddChalet = lazyRoute("pages/AddChalet", () => import("./pages/AddChalet"));
const Dashboard = lazyRoute("pages/Dashboard", () => import("./pages/Dashboard"));
const Admin = lazyRoute("pages/Admin", () => import("./pages/Admin"));
const Services = lazyRoute("pages/Services", () => import("./pages/Services"));
const ServiceDetail = lazyRoute("pages/ServiceDetail", () => import("./pages/ServiceDetail"));
const AddServiceProvider = lazyRoute("pages/AddServiceProvider", () => import("./pages/AddServiceProvider"));
const ProviderDetail = lazyRoute("pages/ProviderDetail", () => import("./pages/ProviderDetail"));
const About = lazyRoute("pages/About", () => import("./pages/About"));
const FAQ = lazyRoute("pages/FAQ", () => import("./pages/FAQ"));
const Terms = lazyRoute("pages/Terms", () => import("./pages/Terms"));
const Privacy = lazyRoute("pages/Privacy", () => import("./pages/Privacy"));
const ContactUs = lazyRoute("pages/ContactUs", () => import("./pages/ContactUs"));
const SubscriptionPage = lazyRoute("pages/SubscriptionPage", () => import("./pages/SubscriptionPage"));
const AddonCheckoutPage = lazyRoute("pages/AddonCheckoutPage", () => import("./pages/AddonCheckoutPage"));
const RatePage = lazyRoute("pages/RatePage", () => import("./pages/RatePage"));
const ContractPage = lazyRoute("pages/ContractPage", () => import("./pages/ContractPage"));
const ServiceContractPage = lazyRoute("pages/ServiceContractPage", () => import("./pages/ServiceContractPage"));
const OwnerChaletDetail = lazyRoute("pages/OwnerChaletDetail", () => import("./pages/OwnerChaletDetail"));
const Login = lazyRoute("pages/Login", () => import("./pages/Login"));
const AdminPortal = lazyRoute("pages/AdminPortal", () => import("./pages/AdminPortal"));
const Register = lazyRoute("pages/Register", () => import("./pages/Register"));
const Verify = lazyRoute("pages/Verify", () => import("./pages/Verify"));
const VerifyPhone = lazyRoute("pages/VerifyPhone", () => import("./pages/VerifyPhone"));
const OnboardingType = lazyRoute("pages/OnboardingType", () => import("./pages/OnboardingType"));
const OnboardingWelcome = lazyRoute("pages/OnboardingWelcome", () => import("./pages/OnboardingWelcome"));
const ResetPassword = lazyRoute("pages/ResetPassword", () => import("./pages/ResetPassword"));
const DualCalendarPickerTestPage = lazyRoute("pages/DualCalendarPickerTestPage", () => import("./pages/DualCalendarPickerTestPage"));
const PhotographerPortal = lazyRoute("features/photography/PhotographerPortal", () => import("./features/photography/PhotographerPortal"));
const PhotographerInvite = lazyRoute("features/photography/PhotographerPortal", () => import("./features/photography/PhotographerPortal"),
  module => ({ default: module.PhotographerInvite }));

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

function VerifiedOwnerRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isPending } = useQuery({
    queryKey: ["owner-onboarding-verification"],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/onboarding/status`, { credentials: "include" });
      if (!response.ok) return false;
      return (await response.json()).ok === true;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  useEffect(() => {
    if (!isPending && data !== true) {
      window.location.replace(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/login`);
    }
  }, [isPending, data]);
  if (isPending || data !== true) return null;
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
      <Route path="/onboarding/type">
        {() => <VerifiedOwnerRoute component={OnboardingType} />}
      </Route>
      <Route path="/onboarding/welcome">
        {() => <VerifiedOwnerRoute component={OnboardingWelcome} />}
      </Route>
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
