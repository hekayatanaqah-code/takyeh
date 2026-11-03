import { useLocation, useSearch } from "wouter";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useStaffAuth } from "@/lib/useStaffAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useGetQuickSalesSettings } from "@workspace/api-client-react";
import { hasApprovedActiveProperty, hasOwnerActivities, initialOwnerDashboardMode, propertySubmissionsForView, selectOwnerService, type PropertyListView } from "@/lib/owner-service-navigation";
import { activityKey, financialManagementAllowed, notificationInActivity } from "@/lib/dashboardActivity";
import OwnerDashboardNavigation, { type OwnerDashboardMode } from "@/components/owner/OwnerDashboardNavigation";
import { hasServiceInsurance, serviceDashboardTabs } from "@/lib/serviceDashboardTabs";
import { toAr } from "@/lib/utils";
import { User, LogOut, Plus, Calendar, Building2, AlertTriangle, Star, BarChart2, TrendingUp, Sun, Lock, Zap, Users, TrendingDown, Edit2, UserCheck, ChevronDown, Archive, MessageSquare, Settings, ExternalLink, Eye, Bell, Briefcase, Send, ListChecks, ScrollText } from "lucide-react";
import { Tag } from "lucide-react";
import { TAB_PERMISSION, ALL_PERM_KEYS, PERM_LABELS } from "@/lib/staffPermissions";
import type { PermKey } from "@/lib/staffPermissions";
import { Navbar } from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DashboardActivitySelector } from "@/components/owner/DashboardActivitySelector";
import OwnerToolbar from "@/components/owner/OwnerToolbar";
import { motion } from "framer-motion";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FinanceUpgradeDialog } from "@/components/owner/FinanceUpgradeDialog";
import { AddonPaymentModal } from "@/components/AddonPaymentModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { QuickSalesSettingsPanel } from "@/components/owner/QuickSalesSettingsPanel";
import OwnerEmptyState from "@/components/owner/OwnerEmptyState";
import OwnerServicesOwner from "@/features/owner-services/OwnerServicesOwner";
import { ServiceManagementNavigation } from "@/components/owner/ServiceManagementNavigation";
import ServiceIdentityLogo from "@/components/owner/ServiceIdentityLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import OwnerSubnav from "@/components/owner/OwnerSubnav";
import { PropertyOffersTab } from "@/components/owner/PropertyOffersTab";
import { AdminFinanceCtx, FinanceUnit, ImpersonationCtx, ServiceErpCtx } from "@/components/owner/OwnerDashboardContexts";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { DashboardSubscription, OwnerPlanLimits, SubscriptionAccountBanner, isSubscriptionExpiryWarning, subscriptionDaysRemaining } from "@/components/owner/SubscriptionAccountBanner";
import { toArN } from "@/components/owner/owner-formatting";
import { SectionGuideButton, SectionGuideActivityContext } from "@/components/owner/SectionGuideButton";
import { UpgradePlanDialog } from "@/components/owner/PropertyRegistrationDialogs";
import { OwnerProfileTab } from "@/components/owner/OwnerProfileTab";
import { SERVICE_CATEGORY_LABELS, ServiceSubmissionsTab } from "@/components/owner/ServiceSubmissionsTab";
import { ServiceManagementContent } from "@/components/owner/ServiceManagementContent";
import { RevenueTab } from "@/components/owner/RevenueTab";
import { BankLedgerTab } from "@/components/owner/BankLedgerTab";
import { ExpensesTab } from "@/components/owner/ExpensesTab";
import { StaffTab } from "@/components/owner/StaffTab";
import { NotificationsTab } from "@/components/owner/NotificationsTab";
import { ReportsTab } from "@/components/owner/ReportsTab";
import { OwnerSupportTab } from "@/components/owner/OwnerSupportTab";
import { TransactionHistoryTab } from "@/components/owner/TransactionHistoryTab";
import { NotificationSettingsSection, OwnerMessageSettingsTab } from "@/components/owner/OwnerMessageSettingsTab";
import { ChaletsTab } from "@/components/owner/ChaletsTab";
import { SeasonsTab } from "@/components/owner/SeasonsTab";
import { ServiceSeasonsTab } from "@/components/owner/ServiceSeasonsTab";
import { ReviewsTab } from "@/components/owner/ReviewsTabs";
import { ChaletServicesTab } from "@/components/owner/ChaletServicesTab";
import { BookingCalendarTab } from "@/components/owner/BookingCalendarTab";
import { ServiceCalendarBookingsTab } from "@/components/owner/ServiceCalendarBookingsTab";
import { DepositsTab } from "@/components/owner/DepositsTab";
import { CustomersTab } from "@/components/owner/CustomersTab";
import { ContractsArchiveTab } from "@/components/owner/ContractTabs";


export default function Dashboard() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const routeParams = new URLSearchParams(search);
  const ownerView = routeParams.get("view");
  const requestedServiceRaw = routeParams.get("serviceId");
  const requestedServiceId = requestedServiceRaw && /^\d+$/.test(requestedServiceRaw)
    && Number.isSafeInteger(Number(requestedServiceRaw)) && Number(requestedServiceRaw) > 0
      ? Number(requestedServiceRaw) : null;
  const [dashMode, setDashMode] = useState<"chalets" | "services" | "admin-finance" | "owner-services" | null>(routeParams.has("photographyBooking") || routeParams.get("mode") === "owner-services" ? "owner-services" : null);
  const [adminFinanceTab, setAdminFinanceTab] = useState<"revenue" | "expenses" | "staff" | "customers" | "notifications" | "reports" | "support" | "history" | "ledger">("revenue");
  const [selectedFinanceUnit, setSelectedFinanceUnit] = useState<FinanceUnit>(() => {
    const key = routeParams.get("activity");
    const match = key?.match(/^(chalet|service)-(\d+)$/);
    if (match && Number.isSafeInteger(Number(match[2])) && Number(match[2]) > 0)
      return match[1] === "chalet" ? { type: "chalet", id: Number(match[2]), name: "عقار" } : { type: "service", id: Number(match[2]), name: "خدمة" };
    return key === "all" || !requestedServiceId ? { type: "all" } : { type: "service", id: requestedServiceId, name: "خدمة" };
  });
  const [financeUpgradeOpen, setFinanceUpgradeOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(requestedServiceId);
  const [serviceView, setServiceView] = useState<"manage" | "submissions">("manage");
  const [selectedServiceTab, setSelectedServiceTab] = useState<string>("details");
  const [activeTab, setActiveTab] = useState<"chalets" | "reviews" | "services" | "calendar" | "deposits" | "seasons" | "offers" | "messageSettings" | "customers" | "digitalContracts" | "notifications">("chalets");
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [activityChoiceOpen, setActivityChoiceOpen] = useState(false);
  const [showHeaderAddon, setShowHeaderAddon] = useState<"chalet" | "service" | null>(null);
  const [serviceFinanceMode, setServiceFinanceMode] = useState<"separate" | "consolidated">(() => (localStorage.getItem("svc_finance_mode") as any) ?? "separate");
  const [clientListMode, setClientListMode] = useState<"unified" | "separate">(() => (localStorage.getItem("svc_client_mode") as any) ?? "unified");
  function toggleFinanceMode() { const n = serviceFinanceMode === "separate" ? "consolidated" : "separate"; setServiceFinanceMode(n); localStorage.setItem("svc_finance_mode", n); }
  function toggleClientMode()  { const n = clientListMode  === "unified"  ? "separate"     : "unified";     setClientListMode(n);   localStorage.setItem("svc_client_mode",   n); }
  const { user, isLoading: authLoading, isAuthenticated, logout, login } = useAuth();
  const { isStaff, staffUser, permissions, isLoading: staffLoading, logout: staffLogout } = useStaffAuth();
  const { toast } = useToast();

  /* ── Admin impersonation detection (must be before queries) ── */
  const [impersonation, setImpersonation] = useState<{
    impersonating: boolean; adminName?: string; ownerName?: string; ownerId?: string;
  }>({ impersonating: false });
  const [impersonationLoading, setImpersonationLoading] = useState(true);
  const [editEnabled, setEditEnabled] = useState(false);
  const [availableOwners, setAvailableOwners] = useState<{ ownerId: string; name: string }[]>([]);
  const [ownerSwitchLoading, setOwnerSwitchLoading] = useState(false);

  useEffect(() => {
    apiFetch("/owner/impersonation-mode")
      .then((r) => r.ok ? r.json() : { active: false })
      .then((d) => {
        /* Only treat as "impersonating" for genuine admin sessions.
           Owner self-sessions (adminLabel === "__owner_self__") are silently
           ignored here — the server's getOwnerIds() helper handles owner_N
           bridging via email lookup, so no temp-session redirect is needed
           for regular password-login owners. */
        if (d.active && d.adminLabel !== "__owner_self__") {
          setImpersonation({
            impersonating: true,
            ownerId: d.ownerId,
            adminName: d.adminLabel,
            ownerName: d.ownerName,
          });
        } else {
          setImpersonation({ impersonating: false });
        }
      })
      .finally(() => setImpersonationLoading(false));
  }, []);

  async function endImpersonation() {
    await apiFetch("/owner/exit-session", { method: "POST" });
    window.location.href = `${BASE}/admin`;
  }

  async function handleEnableEdit() {
    await apiFetch("/admin/audit-log", {
      method: "POST",
      body: JSON.stringify({
        action: editEnabled ? "DISABLE_EDIT_MODE" : "ENABLE_EDIT_MODE",
        targetOwnerId: impersonation.ownerId ?? "",
      }),
    }).catch(() => {});
    setEditEnabled((prev) => !prev);
  }

  async function handleSelectOwner(ownerId: string) {
    setOwnerSwitchLoading(true);
    try {
      const r = await apiFetch("/owner/auto-session", {
        method: "POST",
        body: JSON.stringify({ ownerId }),
      });
      if (!r.ok) throw new Error("failed");
      const { token } = await r.json();
      window.location.href = `${BASE}/api/owner/enter-session?token=${token}`;
    } catch {
      setOwnerSwitchLoading(false);
      toast({ title: "خطأ", description: "تعذر إنشاء جلسة المالك", variant: "destructive" });
    }
  }

  const isImpersonating = impersonation.impersonating;
  const isDemo = impersonation.ownerId === "__demo_preview__";
  /* Self-session: owner activated their own account (not an admin impersonating them) */
  const isSelfSession = impersonation.adminName === "__owner_self__";
  /* Read-only only applies to true admin impersonation, not owner's own session */
  const isReadOnly = isImpersonating && !isSelfSession && !editEnabled && !isDemo;

  /* When impersonating an owner, suppress staff-mode so owner dashboard shows fully */
  const actAsStaff = isStaff && !isImpersonating;

  function onBlockedEdit() {
    toast({ title: "وضع القراءة فقط", description: "فعّل وضع التعديل من الشريط العلوي أولاً", variant: "destructive" });
  }

  /* ── Owner profile: load account type before account-specific data ── */
  type OwnerProfile = {
    businessType?: string;
    business_type?: string;
    accountType?: string;
    role?: string;
    bookingsCalPref?: string;
    reportsCalPref?: string;
    salaryCalPref?: string;
    fullName?: string;
  };
  const {
    data: ownerProfile,
    isLoading: ownerProfileLoading,
    isError: ownerProfileError,
    refetch: retryOwnerProfile,
  } = useQuery<OwnerProfile | null>({
    queryKey: ["owner", "profile-btype", isImpersonating ? impersonation.ownerId : user?.id ?? "self"],
    queryFn: async () => {
      const r = await apiFetch("/owner/profile");
      if (!r.ok) throw new Error("تعذّر تحميل حساب المالك");
      return r.json();
    },
    enabled: (isAuthenticated || isImpersonating) && !actAsStaff,
  });
  /* Keep account-specific controls and requests hidden until the profile has loaded. */
  const profileBusinessType = ownerProfile?.businessType
    ?? ownerProfile?.business_type
    ?? ownerProfile?.accountType
    ?? ownerProfile?.role;
  const normalizedProfileBusinessType = String(profileBusinessType ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const businessType: "chalet" | "service" | "both" | null = !ownerProfile
    ? null
    : ["service", "services", "service_provider", "provider", "مزود_خدمة", "خدمة", "خدمات"].includes(normalizedProfileBusinessType)
      ? "service"
      : ["chalet", "property", "property_owner", "owner", "مالك_عقار", "عقار", "شاليه"].includes(normalizedProfileBusinessType)
        ? "chalet"
        : "both";
  const canSeeChalets  = businessType === "chalet" || businessType === "both";
  const canSeeServices = businessType === "service" || businessType === "both";
  const quickSalesSettings = useGetQuickSalesSettings({ query: {
    enabled: isAuthenticated && canSeeServices,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  } });
  const quickSalesEnabled = quickSalesSettings.data?.enabled === true;

  /* ── Submissions: use apiFetch (credentials: include) + wait for auth ── */
  const { data: submissions, isLoading: submissionsLoading, isError: submissionsError, refetch: retrySubmissions } = useQuery<any[]>({
    queryKey: ["/api/submissions"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await apiFetch("/submissions");
      if (!r.ok) throw new Error("تعذّر تحميل طلبات العقارات");
      return r.json();
    },
    /* Don't fire until we know the auth state; prevents spurious 401 on mount */
    enabled: isStaff || ((isAuthenticated || isImpersonating) && canSeeChalets),
  });

  const { data: ownerChalets = [], isLoading: ownerChaletsLoading, isError: ownerChaletsError, refetch: retryOwnerChalets } = useQuery<any[]>({
    queryKey: ["owner", "chalets", isImpersonating ? impersonation.ownerId : user?.id],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) throw new Error("تعذّر تحميل العقارات");
      return r.json();
    },
    enabled: isStaff || ((isAuthenticated || isImpersonating) && canSeeChalets),
  });

  const { data: planLimits, isError: planLimitsError, refetch: retryPlanLimits } = useQuery<OwnerPlanLimits>({
    queryKey: ["owner", "plan-limits"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) throw new Error("تعذّر التحقق من الاشتراك");
      return r.json();
    },
    enabled: isAuthenticated || isImpersonating,
  });

  const { data: subscription } = useQuery<DashboardSubscription | null>({
    queryKey: ["owner", "subscription-header"],
    queryFn: async () => {
      const r = await apiFetch("/owner/subscription?reminderPreview=1");
      if (!r.ok) return null;
      return r.json();
    },
    enabled: isAuthenticated || isImpersonating,
    refetchInterval: 15000,
  });
  const freeAccess = subscription?.freeAccess?.active
    ? subscription.freeAccess
    : planLimits?.freeAccess?.active ? planLimits.freeAccess : null;
  const dashboardSubscription: DashboardSubscription | null = subscription
    ? { ...subscription, freeAccess }
    : freeAccess
      ? { plan: "trial", status: "active", expiresAt: null, paymentStatus: "paid", freeAccess }
      : null;

  /* ── My independent service submissions & approved providers ── */
  const { data: myServiceSubmissions = [], isLoading: serviceSubmissionsLoading, isError: serviceSubmissionsError, refetch: retryServiceSubmissions } = useQuery<{ id: number; status: string; businessName: string }[]>({
    queryKey: ["my-service-submissions"],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/submissions");
      if (!r.ok) throw new Error("تعذّر تحميل طلبات الخدمات");
      return r.json();
    },
    enabled: (isAuthenticated || isImpersonating) && !actAsStaff && canSeeServices,
  });
  const { data: myApprovedProviders = [], isLoading: providersLoading, isError: providersError, refetch: retryProviders } = useQuery<{ id: number; isActive: boolean; businessName: string; category: string; city: string; logoUrl: string | null; requiresInsurance: boolean; requiresContract: boolean; insuranceAmount: string | null }[]>({
    queryKey: ["my-approved-providers", isImpersonating ? impersonation.ownerId : user?.id],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/approved");
      if (!r.ok) throw new Error("تعذّر تحميل الخدمات");
      return r.json();
    },
    enabled: (isAuthenticated || isImpersonating) && !actAsStaff && canSeeServices,
  });

  /* Ordinary owners enter an activity dashboard, never a separate hub. */
  const effectiveDashMode = dashMode ?? (actAsStaff || isImpersonating ? "chalets" : initialOwnerDashboardMode(
    businessType, myApprovedProviders.length, myServiceSubmissions.length, providersError,
  ));
  const hasOperationalProperty = canSeeChalets && !submissionsLoading && !ownerChaletsLoading
    && !submissionsError && !ownerChaletsError && hasApprovedActiveProperty(submissions, ownerChalets);
  const canUseAdvancedPropertyTabs = actAsStaff || hasOperationalProperty;
  // Independent service dashboards retain their existing financial management.
  const hasOperationalActivity = hasOperationalProperty
    || (canSeeServices && !providersLoading && !providersError && myApprovedProviders.length > 0);
  const canAccessFinancialAdmin = actAsStaff || (hasOperationalActivity && financialManagementAllowed(planLimits));
  const scopedOwnerChalets = ownerChalets.filter((chalet: any) =>
    (actAsStaff || submissions?.some((submission: any) => submission.id === chalet.submissionId && submission.status === "approved"))
    && (selectedFinanceUnit.type !== "chalet" || chalet.id === selectedFinanceUnit.id));
  const activeDashMode: "chalets" | "services" | "admin-finance" | "owner-services" =
    effectiveDashMode === "owner-services" && !actAsStaff
      ? "owner-services"
      : effectiveDashMode === "admin-finance" && canAccessFinancialAdmin
      ? "admin-finance"
      : effectiveDashMode === "admin-finance" && !canAccessFinancialAdmin
        ? businessType === "service" ? "services" : "chalets"
      : !actAsStaff && businessType === "service"
        ? "services"
      : !actAsStaff && businessType === "chalet"
        ? "chalets"
      : effectiveDashMode;

  /* Cross-owner logic: user has BOTH chalets AND service providers */
  const isCrossOwner = (ownerChalets?.length ?? 0) > 0 && myApprovedProviders.length > 0;
  const headerAtChaletLimit = planLimits
    ? (planLimits.active === false && !planLimits.canSubmitActivities) || planLimits.chaletCount >= planLimits.chaletLimit
    : false;
  const atServiceLimit = planLimits
    ? (planLimits.active === false && !planLimits.canSubmitActivities) || (planLimits.serviceCount ?? myServiceSubmissions.length + myApprovedProviders.length) >= planLimits.serviceLimit
    : false;

  useEffect(() => {
    if (actAsStaff || isImpersonating) return;
    const previousTitle = document.title;
    document.title = activeDashMode === "services" ? "لوحة تحكم الخدمة | تكية" : "لوحة تحكم المالك | تكية";
    return () => { document.title = previousTitle; };
  }, [activeDashMode, actAsStaff, isImpersonating]);

  useEffect(() => {
    if (actAsStaff || isImpersonating) return;
    const requestedMode = new URLSearchParams(search).get("mode");
    const requestedActivity = new URLSearchParams(search).get("activity");
    const activityMatch = requestedActivity?.match(/^(chalet|service)-(\d+)$/);
    if (requestedActivity === "all") setSelectedFinanceUnit(previous => previous.type === "all" ? previous : { type: "all" });
    else if (activityMatch && Number.isSafeInteger(Number(activityMatch[2])) && Number(activityMatch[2]) > 0) {
      const id = Number(activityMatch[2]);
      setSelectedFinanceUnit(previous => activityKey(previous) === requestedActivity ? previous
        : activityMatch[1] === "chalet" ? { type: "chalet", id, name: "عقار" } : { type: "service", id, name: "خدمة" });
    }
    if (requestedServiceId) {
      setDashMode(requestedMode === "admin-finance" || requestedMode === "chalets" || requestedMode === "owner-services" ? requestedMode : "services");
      if (selectedServiceId !== requestedServiceId) {
        setSelectedServiceId(requestedServiceId);
        setSelectedServiceTab("details");
      }
      if (ownerView !== "account") setServiceView(ownerView === "requests" || ownerView === "manage" ? "submissions" : "manage");
    }
    if (new URLSearchParams(search).has("photographyBooking")) {
      setDashMode("owner-services");
    } else if (requestedMode === "admin-finance" || requestedMode === "chalets" || requestedMode === "services" || requestedMode === "owner-services") {
      setDashMode(requestedMode);
    }
    setAccountSettingsOpen(ownerView === "account");
    if (ownerView === "manage" || ownerView === "requests") {
      setServiceView("submissions");
      setActiveTab("chalets");
      if (ownerView === "requests" && canSeeServices && requestedMode !== "chalets") setDashMode("services");
    }
  }, [search, actAsStaff, isImpersonating, canSeeServices]);

  function selectService(id: number) {
    const service = myApprovedProviders.find(item => item.id === id);
    if (service) setSelectedFinanceUnit({ type: "service", id, name: service.businessName });
    setSelectedServiceId(id);
    setSelectedServiceTab("details");
    if (!isImpersonating && !actAsStaff) navigate(`/dashboard?serviceId=${id}&activity=service-${id}&mode=services`);
  }

  function addOwnerActivity(kind: "chalet" | "service") {
    if (!planLimits) {
      toast({ title: planLimitsError ? "تعذّر التحقق من الاشتراك" : "يرجى الانتظار",
        description: planLimitsError ? "أعد المحاولة للتحقق من صلاحية إضافة نشاط." : "جارٍ التحقق من صلاحيات الاشتراك. أعد المحاولة بعد لحظات.",
        variant: planLimitsError ? "destructive" : "default" });
      if (planLimitsError) void retryPlanLimits();
      return;
    }
    if (planLimits.active === false && !planLimits.canSubmitActivities) { navigate("/subscription"); return; }
    if (kind === "chalet" ? headerAtChaletLimit : atServiceLimit) { setShowHeaderAddon(kind); return; }
    navigate(kind === "chalet" ? "/add-chalet" : "/add-service-provider");
  }

  function openRegistrationRequests() {
    const requestsMode = activeDashMode === "chalets" && canSeeChalets
      ? "chalets" : canSeeServices ? "services" : "chalets";
    if (requestsMode === "services") {
      setDashMode("services");
      setServiceView("submissions");
    } else {
      setDashMode("chalets");
      setActiveTab("chalets");
    }
    const params = new URLSearchParams({ mode: requestsMode, view: "requests" });
    if (requestsMode === "services" && selectedServiceId) params.set("serviceId", String(selectedServiceId));
    navigate(`/dashboard?${params.toString()}`);
  }

  function switchOwnerDashboard(mode: OwnerDashboardMode) {
    if (mode === "admin-finance" && !canAccessFinancialAdmin) {
      setFinanceUpgradeOpen(true);
      return;
    }
    if (mode === "chalets" && selectedFinanceUnit.type === "service") setSelectedFinanceUnit({ type: "all" });
    if (mode === "services" && selectedFinanceUnit.type === "chalet") setSelectedFinanceUnit({ type: "all" });
    if (mode === "admin-finance" && unreadNotifCount + unreadSupportCount > 0) {
      setAdminFinanceTab("notifications");
    }
    setDashMode(mode);
    if (mode === "chalets") setActiveTab("chalets");
    setServiceView("manage");
    setAccountSettingsOpen(false);
    if (!actAsStaff && !isImpersonating) {
      const params = new URLSearchParams();
      if (selectedServiceId) params.set("serviceId", String(selectedServiceId));
      params.set("activity", mode === "chalets" && selectedFinanceUnit.type === "service"
        || mode === "services" && selectedFinanceUnit.type === "chalet" ? "all" : activityKey(selectedFinanceUnit));
      params.set("mode", mode);
      navigate(`/dashboard?${params.toString()}`);
    }
  }

  /* Auto-set dashMode based on businessType when profile loads; also seed calendar prefs from DB */
  useEffect(() => {
    if (!ownerProfile || !businessType) return;
    if (businessType === "service" && dashMode === "chalets") setDashMode("services");
    if (businessType === "chalet" && dashMode === "services") setDashMode("chalets");
    /* Seed calendar prefs from DB — DB is source of truth, overrides localStorage */
    if (ownerProfile.bookingsCalPref) {
      const bPref = ownerProfile.bookingsCalPref as "hijri" | "gregorian";
      localStorage.setItem("dashCalDefaultType", bPref);
    }
    if (ownerProfile.reportsCalPref) {
      const rPref = ownerProfile.reportsCalPref as "gregorian" | "hijri";
      localStorage.setItem("revCalType", rPref);
    }
    /* salaryCalPref: only seed localStorage if key not yet set (first-time user).
       Account settings onClick is the sole authority for live changes. */
    if (ownerProfile.salaryCalPref && !localStorage.getItem("staffCalDefault")) {
      localStorage.setItem("staffCalDefault", ownerProfile.salaryCalPref);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerProfile]);

  /* Preserve a valid selection; recover when the selected service is removed. */
  useEffect(() => {
    if (activeDashMode !== "services") return;
    if (!actAsStaff && !isImpersonating && requestedServiceRaw) return;
    if (myApprovedProviders.some((provider) => provider.id === selectedServiceId)) return;
    const nextServiceId = selectOwnerService(myApprovedProviders, selectedServiceId);
    if (nextServiceId !== selectedServiceId) {
      setSelectedServiceId(nextServiceId);
      setSelectedServiceTab("details");
    }
  }, [activeDashMode, myApprovedProviders, selectedServiceId, requestedServiceRaw, actAsStaff, isImpersonating]);

  useEffect(() => {
    if (planLimits?.scope !== "property" || dashMode !== "admin-finance") return;
    setDashMode(businessType === "service" ? "services" : "chalets");
  }, [planLimits?.scope, dashMode, businessType]);

  useEffect(() => {
    if (providersLoading || providersError) return;
    const scoped = selectedFinanceUnit.type === "all"
      ? myApprovedProviders
      : myApprovedProviders.filter(item => item.id === selectedServiceId);
    if (!serviceDashboardTabs(scoped, quickSalesEnabled).some(tab => tab.id === selectedServiceTab)) {
      setSelectedServiceTab("details");
    }
  }, [selectedServiceId, selectedServiceTab, myApprovedProviders, selectedFinanceUnit.type, providersLoading, providersError, quickSalesEnabled]);

  /* One activity scope for every section; preserve all rather than auto-picking a property. */
  useEffect(() => {
    if (ownerChaletsLoading || providersLoading || ownerChaletsError || providersError) return;
    if (selectedFinanceUnit.type === "chalet") {
      const chalet = ownerChalets.find((c: any) => c.id === selectedFinanceUnit.id);
      if (!chalet) setSelectedFinanceUnit({ type: "all" });
      else if (selectedFinanceUnit.submissionId !== chalet.submissionId || selectedFinanceUnit.name !== chalet.nameAr)
        setSelectedFinanceUnit({ type: "chalet", id: chalet.id, submissionId: chalet.submissionId, name: chalet.nameAr });
    } else if (selectedFinanceUnit.type === "service") {
      const service = myApprovedProviders.find(p => p.id === selectedFinanceUnit.id);
      if (!service) setSelectedFinanceUnit({ type: "all" });
      else if (selectedFinanceUnit.name !== service.businessName) setSelectedFinanceUnit({ ...selectedFinanceUnit, name: service.businessName });
    }
  }, [ownerChalets, myApprovedProviders, ownerChaletsLoading, providersLoading, ownerChaletsError, providersError, selectedFinanceUnit]);

  function changeDashboardActivity(unit: FinanceUnit) {
    setSelectedFinanceUnit(unit);
    if (unit.type === "service") setSelectedServiceId(unit.id);
    const mode = activeDashMode === "admin-finance" ? "admin-finance"
      : unit.type === "service" ? "services"
      : unit.type === "chalet" || canUseAdvancedPropertyTabs ? "chalets" : "services";
    setDashMode(mode);
    setServiceView("manage");
    setAccountSettingsOpen(false);
    if (!actAsStaff && !isImpersonating) {
      const params = new URLSearchParams({ mode, activity: activityKey(unit) });
      if (unit.type === "service") params.set("serviceId", String(unit.id));
      navigate(`/dashboard?${params}`);
    }
  }

  interface NotifSummaryRow { id: number; isRead: boolean; type: string; message: string; chaletId?: number | null; submissionId?: number | null; providerId?: number | null; }
  const { data: notifSummary = [] } = useQuery<NotifSummaryRow[]>({
    queryKey: ["owner", "notifications-summary"],
    queryFn: async () => {
      const r = await apiFetch("/owner/notifications");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isAuthenticated || isStaff || isImpersonating,
    refetchInterval: 15_000,
  });
  const unreadNotifCount = notifSummary.filter((n) => !n.isRead && notificationInActivity(n, selectedFinanceUnit)).length;

  /* ── Unread admin replies count (support badge) ── */
  const { data: supportUnread } = useQuery<{ count: number }>({
    queryKey: ["owner", "support-unread-count"],
    queryFn: async () => {
      const r = await apiFetch("/owner/support-requests/unread-count");
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    enabled: isAuthenticated || isImpersonating,
    refetchInterval: 30_000,
  });
  const unreadSupportCount = supportUnread?.count ?? 0;

  /* ── Audio ping helper (Web Audio API — no external file needed) ── */
  const playPing = useCallback((type: "booking" | "review" | "cancel") => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      if (type === "cancel") {
        // Lower, shorter descending tone for cancellations
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.4);
      } else if (type === "review") {
        // Brighter tone for reviews
        osc.frequency.setValueAtTime(1046, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.3);
      } else {
        // Standard booking ping
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      }
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
      osc.onended = () => ctx.close();
    } catch (_) {}
  }, []);

  /* ── Helper: extract chalet name from notification message ── */
  function parseNotifToast(type: string, message: string): { title: string; description: string; cls: string } {
    const displayMsg = message.includes(" | wa.me/") ? message.slice(0, message.lastIndexOf(" | wa.me/")).trim() : message;
    if (type === "new_booking") {
      // "حجز جديد في [chalet] — [client] — [date] (period)"
      const m = displayMsg.match(/في (.+?) —/);
      const chaletName = m ? m[1] : "";
      return {
        title: "📅 حجز جديد",
        description: chaletName ? `حجز جديد — ${chaletName}` : displayMsg.slice(0, 80),
        cls: "border-r-4 border-r-blue-500 dark:border-r-blue-400",
      };
    }
    if (type === "new_review") {
      // "تقييم جديد لـ[chalet] — ★★★★☆ — ..."
      const chaletM = displayMsg.match(/لـ(.+?) —/);
      const starsM  = displayMsg.match(/(★+)/);
      const chaletName = chaletM ? chaletM[1] : "";
      const starCount  = starsM ? starsM[1].length : 0;
      return {
        title: "⭐ تقييم جديد",
        description: `تقييم جديد (${toAr(starCount)} نجوم)${chaletName ? ` — ${chaletName}` : ""}`,
        cls: "border-r-4 border-r-amber-400 dark:border-r-amber-300",
      };
    }
    if (type === "cancellation") {
      // "إلغاء حجز في [chalet] — ..."
      const m = displayMsg.match(/في (.+?) —/);
      const chaletName = m ? m[1] : "";
      return {
        title: "🚫 إلغاء حجز",
        description: chaletName ? `إلغاء حجز في ${chaletName}` : displayMsg.slice(0, 80),
        cls: "border-r-4 border-r-red-500 dark:border-r-red-400",
      };
    }
    return { title: "🔔 إشعار جديد", description: displayMsg.slice(0, 80), cls: "" };
  }

  /* ── Real-time popup: toast + sound when new notifications arrive ── */
  const prevNotifIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!isAuthenticated && !isImpersonating) return;
    const currentIds = new Set(notifSummary.map((n) => n.id));
    if (prevNotifIdsRef.current === null) { prevNotifIdsRef.current = currentIds; return; }
    // Find genuinely new notification IDs
    const newOnes = notifSummary.filter((n) => !prevNotifIdsRef.current!.has(n.id));
    if (newOnes.length > 0) {
      // Pick the most recent one for the sound type
      const first = newOnes[0];
      const soundType = first.type === "cancellation" ? "cancel" : first.type === "new_review" ? "review" : "booking";
      playPing(soundType);
      // Show a toast for each new notification (max 3 to avoid spam)
      newOnes.slice(0, 3).forEach(({ type, message }) => {
        const { title, description, cls } = parseNotifToast(type, message);
        toast({ title, description, className: cls });
      });
    }
    prevNotifIdsRef.current = currentIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifSummary]);

  const allTabs = [
    { id: "chalets",   label: "عقاراتي",             icon: <Building2 className="w-4 h-4" /> },
    { id: "seasons",   label: "المواسم والأعياد",    icon: <Sun className="w-4 h-4" /> },
    { id: "offers",    label: "العروض والخصومات",   icon: <Tag className="w-4 h-4" /> },
    { id: "reviews",   label: "التقييمات",            icon: <Star className="w-4 h-4" /> },
    { id: "calendar",  label: "التقويم والحجوزات",   icon: <Calendar className="w-4 h-4" /> },
    { id: "deposits",  label: "إدارة التأمينات",       icon: <Lock className="w-4 h-4" /> },
    { id: "customers", label: "قاعدة العملاء",        icon: <UserCheck className="w-4 h-4" /> },
    { id: "services",  label: "إدارة الخدمات والمرافق", icon: <Plus className="w-4 h-4" /> },
    { id: "messageSettings", label: "إعدادات الرسائل الآلية", icon: <Send className="w-4 h-4" /> },
    { id: "digitalContracts", label: "العقود الرقمية",         icon: <ScrollText className="w-4 h-4" /> },
  ] as const;

  const tabs = useMemo(() => {
    if (!actAsStaff) return canUseAdvancedPropertyTabs ? allTabs : allTabs.filter(tab => tab.id === "chalets");
    return allTabs.filter((tab) => {
      const permKey = TAB_PERMISSION[tab.id];
      if (!permKey || permKey === "__owner__") return false;
      return permissions[permKey as PermKey] === true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actAsStaff, permissions, canUseAdvancedPropertyTabs]);

  // Guard the render itself, not only the effect: stale selections cannot mount hidden sections.
  const propertyRequestsOpen = !actAsStaff && activeDashMode === "chalets" && ownerView === "requests";
  const propertyListView: PropertyListView = propertyRequestsOpen ? "requests" : "approved";
  const visiblePropertySubmissions = propertySubmissionsForView(submissions, propertyListView)
    .filter(item => propertyRequestsOpen || selectedFinanceUnit.type !== "chalet" || item.id === selectedFinanceUnit.submissionId);
  const visiblePropertyTab = propertyRequestsOpen
    ? "chalets" : tabs.find(tab => tab.id === activeTab)?.id ?? tabs[0]?.id;

  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    function handleSwitchTab(e: Event) {
      const tab = (e as CustomEvent).detail as string;
      const allowedTab = tabs.find(item => item.id === tab);
      if (allowedTab) setActiveTab(allowedTab.id);
    }
    window.addEventListener("switch-dashboard-tab", handleSwitchTab);
    return () => window.removeEventListener("switch-dashboard-tab", handleSwitchTab);
  }, [tabs]);

  const isLoadingAuth = authLoading || staffLoading;
  const ownerInventoryLoading =
    (canSeeChalets && (ownerChaletsLoading || submissionsLoading))
    || (canSeeServices && (providersLoading || serviceSubmissionsLoading));
  const ownerInventoryFailed =
    (canSeeChalets && (ownerChaletsError || submissionsError))
    || (canSeeServices && (providersError || serviceSubmissionsError));
  const showOwnerEmptyState = !actAsStaff && !isImpersonating && businessType !== null
    && !ownerInventoryLoading && !ownerInventoryFailed
    && !hasOwnerActivities(ownerChalets.length, submissions?.length ?? 0, myApprovedProviders.length, myServiceSubmissions.length);

  const isFullyLoading  = isLoadingAuth
    || impersonationLoading
    || ownerSwitchLoading
    || (!actAsStaff && (isAuthenticated || isImpersonating) && ownerProfileLoading)
    || (!actAsStaff && !isImpersonating && ownerInventoryLoading)
    || (!actAsStaff && !isImpersonating && canSeeServices && (providersLoading || serviceSubmissionsLoading))
    || (!actAsStaff && !isImpersonating && !requestedServiceRaw && activeDashMode === "services" && !providersError
      && myApprovedProviders.length > 0 && !myApprovedProviders.some(p => p.id === selectedServiceId))
    || (!actAsStaff && !isImpersonating && !!requestedServiceId
      && (providersLoading || selectedServiceId !== requestedServiceId));
  const canAccess       = isAuthenticated || isStaff || isImpersonating;

  useEffect(() => {
    if (!isFullyLoading && !canAccess) {
      if (!isStaff) {
        login("/dashboard");
      } else {
        navigate("/staff-login");
      }
    }
  }, [isFullyLoading, canAccess, isStaff, login, navigate]);

  if (isFullyLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6" role="status" aria-label="جارٍ تحميل لوحة المالك" data-testid="owner-dashboard-loading">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!canAccess) return null;

  // Initial failures are unknown inventory, not an empty account. Keep already
  // loaded activity screens mounted on background failures so edits survive.
  if (!actAsStaff && !isImpersonating && (
    (ownerProfileError && !ownerProfile)
    || (ownerInventoryFailed && !hasOwnerActivities(ownerChalets.length, submissions?.length ?? 0, myApprovedProviders.length, myServiceSubmissions.length))
  )) {
    return <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div role="alert" className="mx-auto max-w-3xl px-4 py-16 text-center space-y-4">
        <h1 className="text-xl font-bold">{ownerProfileError ? "تعذّر تحميل حساب المالك" : "تعذّر تحميل أنشطة المالك"}</h1>
        <Button onClick={() => {
          if (ownerProfileError) void retryOwnerProfile();
          if (canSeeChalets) { void retryOwnerChalets(); void retrySubmissions(); }
          if (canSeeServices) { void retryProviders(); void retryServiceSubmissions(); }
        }}>إعادة المحاولة</Button>
      </div>
    </div>;
  }

  if (!actAsStaff && !isImpersonating && requestedServiceRaw
    && (!requestedServiceId || providersError || !myApprovedProviders.some(p => p.id === requestedServiceId))) {
    return <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-16 text-center space-y-4">
        <h1 className="text-xl font-bold">{providersError ? "تعذّر تحميل الخدمة" : "الخدمة غير متاحة في حسابك"}</h1>
        <Button onClick={() => navigate("/dashboard")}>العودة إلى لوحة التحكم</Button>
        {providersError && <Button variant="outline" onClick={() => { void retryProviders(); }}>إعادة المحاولة</Button>}
      </div>
    </div>;
  }

  return (
    <ImpersonationCtx.Provider value={{ isReadOnly, onBlockedEdit }}>
    <AdminFinanceCtx.Provider value={{ unit: selectedFinanceUnit, selectUnit: changeDashboardActivity }}>
    <SectionGuideActivityContext.Provider value={selectedFinanceUnit.type === "service" ? "service"
      : selectedFinanceUnit.type === "chalet" ? "property" : isCrossOwner ? "both"
        : businessType === "service" || (myApprovedProviders.length > 0 && !ownerChalets?.length) ? "service" : "property"}>
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Demo Preview Banner ── */}
      {isDemo && (
        <div className="sticky top-0 z-50 w-full px-4 py-2 flex items-center justify-between gap-3 flex-wrap bg-emerald-600 text-white" dir="rtl">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>
              <span className="font-bold">وضع العرض التجريبي</span>
              <span className="mx-2 opacity-70">—</span>
              <span className="opacity-90 font-normal">البيانات افتراضية لا تؤثر على أي مستخدم حقيقي</span>
            </span>
          </div>
          <button
            onClick={endImpersonation}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            العودة للإدارة
          </button>
        </div>
      )}

      {/* ── Impersonation Banner (real owner, not demo) ── */}
      {isImpersonating && !isDemo && !isSelfSession && (
        <div
          className={`sticky top-0 z-50 w-full px-4 py-2 flex items-center justify-between gap-3 flex-wrap ${editEnabled ? "bg-red-600 text-white" : "bg-amber-500 text-amber-950"}`}
          dir="rtl"
        >
          {/* Left: status label */}
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>
              معاينة كمدير
              {editEnabled
                ? <span className="mr-1 font-bold">(وضع التعديل نشط — مسجّل)</span>
                : <span className="mr-1 opacity-80">(وضع القراءة فقط)</span>
              }
              —&nbsp;
              <span className="font-bold">{impersonation.ownerName ?? "مالك"}</span>
            </span>
            {impersonation.adminName && (
              <span className="font-normal opacity-60 text-xs hidden sm:inline">
                ({impersonation.adminName})
              </span>
            )}
          </div>
          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Enable / Disable Edit toggle */}
            <button
              onClick={handleEnableEdit}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                editEnabled
                  ? "bg-white/20 hover:bg-white/30 border-white/30 text-white"
                  : "bg-amber-950/10 hover:bg-amber-950/20 border-amber-950/20 text-amber-950"
              }`}
            >
              {editEnabled ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  إيقاف التعديل
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                  تفعيل التعديل
                </>
              )}
            </button>
            {/* Return to admin */}
            <button
              onClick={endImpersonation}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                editEnabled
                  ? "bg-white/20 hover:bg-white/30 text-white border border-white/30"
                  : "bg-amber-950/15 hover:bg-amber-950/25 text-amber-950"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              العودة للوحة المشرف العام
            </button>
          </div>
        </div>
      )}
      <Navbar ownerDashboard={!actAsStaff && !isImpersonating} />
      {(actAsStaff || isImpersonating) && hasOperationalActivity && <div className="container mx-auto max-w-6xl px-4">
        <DashboardActivitySelector value={selectedFinanceUnit} properties={ownerChalets} services={myApprovedProviders} onChange={changeDashboardActivity} />
      </div>}
      {!actAsStaff && !isImpersonating && (
        <div className="container mx-auto max-w-6xl px-4 pt-6">
          <OwnerToolbar
            ownerName={ownerProfile?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "حساب المالك"}
            canAddChalet={canSeeChalets}
            canAddService={canSeeServices}
            onAddActivity={addOwnerActivity}
            activityChoiceOpen={activityChoiceOpen}
            onActivityChoiceOpenChange={setActivityChoiceOpen}
            onAccountSettings={() => setAccountSettingsOpen(true)}
            onSubscription={() => navigate("/subscription")}
            onManageRequests={openRegistrationRequests}
            onOwnerServices={() => switchOwnerDashboard("owner-services")}
            ownerServicesOpen={activeDashMode === "owner-services" && !accountSettingsOpen}
            onLogout={logout}
            requestsOpen={showOwnerEmptyState ? ownerView === "requests" : activeDashMode === "services" ? serviceView === "submissions" || myApprovedProviders.length === 0 : ownerView === "requests" && activeDashMode === "chalets"}
          />
          {!showOwnerEmptyState && hasOperationalActivity && <DashboardActivitySelector
            value={selectedFinanceUnit}
            properties={ownerChalets.filter((chalet: any) => submissions?.some((submission: any) => submission.id === chalet.submissionId && submission.status === "approved"))}
            services={myApprovedProviders}
            onChange={changeDashboardActivity}
          />}
          {<OwnerDashboardNavigation
              mode={activeDashMode}
              requestsOpen={activeDashMode === "services" ? serviceView === "submissions" || myApprovedProviders.length === 0 : ownerView === "requests" && activeDashMode === "chalets"}
              canSeeChalets={!showOwnerEmptyState && canSeeChalets}
              canSeeServices={!showOwnerEmptyState && canSeeServices}
              canAccessFinance={!showOwnerEmptyState && canAccessFinancialAdmin}
              showFinance={!showOwnerEmptyState && hasOperationalActivity}
              onFinanceLocked={() => setFinanceUpgradeOpen(true)}
              unreadCount={unreadNotifCount + unreadSupportCount}
              onSelect={switchOwnerDashboard}
          />}
        </div>
      )}
      {!showOwnerEmptyState && !actAsStaff && !freeAccess && subscription && isSubscriptionExpiryWarning(subscription)
        && (subscription.reminderPreviewMilestone !== undefined || (!isStaff && !isImpersonating)) && (() => {
        const isPreview = subscription.reminderPreviewMilestone !== undefined;
        const daysRemaining = subscriptionDaysRemaining(subscription);
        const isExpired = !isPreview && (subscription.status === "expired" || (daysRemaining !== null && daysRemaining <= 0));
        const dayLabel = daysRemaining === 1
          ? "يوم واحد"
          : daysRemaining === 2
            ? "يومان"
            : daysRemaining !== null && daysRemaining >= 3 && daysRemaining <= 10
              ? `${toArN(daysRemaining)} أيام`
              : `${toArN(daysRemaining ?? 0)} يوم`;
        return (
          <div role="alert" className="container mx-auto max-w-4xl px-4 pt-4" data-testid={isPreview ? "banner-subscription-reminder-preview" : undefined}>
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border px-4 py-4 ${
              isExpired
                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
                : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${isExpired ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300"}`} />
                <div>
                  <p className="font-bold">
                    {isPreview && <span className="ml-2 rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-950">TEST · معاينة</span>}
                    {isPreview && subscription.reminderPreviewMilestone === 0
                      ? "ينتهي اشتراكك اليوم"
                      : isExpired ? "انتهت صلاحية اشتراكك" : `تبقّى على انتهاء اشتراكك ${dayLabel}`}
                  </p>
                  <p className="mt-1 text-sm">
                    {isPreview
                      ? "هذا تنبيه تجريبي لمعاينة الشكل فقط؛ اشتراكك الحقيقي لم يتغير. زر التجديد يفتح صفحة اشتراكك الحقيقي."
                      : isExpired
                      ? "جدّد الاشتراك الآن لمواصلة استقبال الحجوزات وإضافة العقارات والخدمات."
                      : "جدّد اشتراكك الآن لضمان استمرار خدماتك دون انقطاع."}
                  </p>
                </div>
              </div>
              <Button
                data-testid="button-renew-subscription-warning"
                className={`shrink-0 text-white ${isExpired ? "bg-red-700 hover:bg-red-800" : "bg-amber-700 hover:bg-amber-800"}`}
                onClick={() => navigate("/subscription")}
              >
                تجديد الاشتراك
                <ExternalLink className="w-4 h-4 me-2" />
              </Button>
            </div>
          </div>
        );
      })()}

      <div className={`container mx-auto px-4 py-6 ${!actAsStaff && !isImpersonating ? "max-w-6xl" : "max-w-4xl"}`}>


        {/* Profile Card — adapts for owner vs staff */}
        {(actAsStaff || isImpersonating) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`border border-border rounded-3xl p-6 md:p-8 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-sm ${actAsStaff ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-card"}`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${actAsStaff ? "bg-blue-100 dark:bg-blue-900/40" : "bg-primary/10"}`}>
            {!actAsStaff && user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt={user.firstName ?? ""} className="w-16 h-16 rounded-2xl object-cover" />
            ) : actAsStaff ? (
              <UserCheck className="w-8 h-8 text-blue-600" />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {actAsStaff ? (
              <>
                <h1 className="text-2xl font-bold text-foreground">أهلاً، {staffUser?.name ?? "عزيزنا"} 👋</h1>
                <p className="text-muted-foreground mt-1">أنت مسجّل دخول كموظف — صلاحياتك محددة من قبل صاحب العمل</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ALL_PERM_KEYS.filter((k) => permissions[k]).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 font-medium">
                      {PERM_LABELS[k].icon} {PERM_LABELS[k].label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground">
                  {isImpersonating ? `عرض حساب: ${impersonation.ownerName ?? "المالك"}` : `أهلاً، ${user?.firstName ?? "عزيزنا"} 👋`}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-muted-foreground">
                    {businessType === "service"
                      ? "لوحة تحكم خدماتك في مكان واحد"
                      : businessType === "chalet"
                        ? "لوحة تحكم عقاراتك في مكان واحد"
                        : "لوحة تحكمك الموحدة — العقارات والخدمات في مكان واحد"}
                  </p>
                  <SectionGuideButton sectionKey="dashboard" />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {!actAsStaff && !isImpersonating && (
              (canSeeChalets || canSeeServices) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-testid="button-add-property-or-service-capacity" className="rounded-xl font-semibold text-sm">
                      <Plus className="w-4 h-4 me-1.5" />
                      إضافة عقار أو خدمة
                      <ChevronDown className="w-4 h-4 ms-1.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52" style={{ direction: "rtl" }}>
                    {canSeeChalets && (
                      <DropdownMenuItem
                        data-testid="menu-add-chalet"
                        className="cursor-pointer"
                        onSelect={() => planLimits?.active === false && !planLimits.canSubmitActivities
                          ? navigate("/subscription")
                          : headerAtChaletLimit ? setShowHeaderAddon("chalet") : navigate("/add-chalet")}
                      >
                        {headerAtChaletLimit && planLimits?.active !== false && !freeAccess ? "طلب سعة لعقار إضافي" : "إضافة عقار"}
                      </DropdownMenuItem>
                    )}
                    {canSeeServices && (
                      <DropdownMenuItem
                        data-testid="menu-add-service"
                        className="cursor-pointer"
                        onSelect={() => planLimits?.active === false && !planLimits.canSubmitActivities
                          ? navigate("/subscription")
                          : atServiceLimit ? setShowHeaderAddon("service") : navigate("/add-service-provider")}
                      >
                        {atServiceLimit && planLimits?.active !== false && !freeAccess ? "طلب سعة لخدمة إضافية" : "إضافة خدمة"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            )}
            {!actAsStaff && !isImpersonating ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="قائمة الحساب"
                    data-testid="account-menu-trigger"
                    className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {!actAsStaff && user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="" className="h-7 w-7 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <User className="h-4 w-4" />
                      </span>
                    )}
                    <span className="hidden sm:inline">حسابي</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div dir="rtl">
                    <DropdownMenuItem
                      data-testid="account-settings-menu-item"
                      onSelect={() => setAccountSettingsOpen(true)}
                      className="cursor-pointer gap-2 py-2.5"
                    >
                      <Settings className="h-4 w-4 text-primary" />
                      <span>إعدادات الحساب</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="logout-menu-item"
                      onSelect={() => logout()}
                      className="cursor-pointer gap-2 py-2.5 text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>تسجيل الخروج</span>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                onClick={() => isStaff ? staffLogout() : logout()}
                className="rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive text-sm px-3"
              >
                <LogOut className="w-4 h-4 me-1.5" />
                خروج
              </Button>
            )}
          </div>
        </motion.div>
        )}
        <UpgradePlanDialog
          open={showHeaderAddon !== null && !!freeAccess}
          onClose={() => setShowHeaderAddon(null)}
          onRequestAddon={() => {}}
          context={showHeaderAddon ?? "chalet"}
          active={planLimits?.active}
          extraPrice={showHeaderAddon === "service" ? planLimits?.extraServicePrice : planLimits?.extraChaletPrice}
          freeAccess
        />
        <FinanceUpgradeDialog open={financeUpgradeOpen} onOpenChange={setFinanceUpgradeOpen}
          onViewPlans={() => { setFinanceUpgradeOpen(false); navigate("/subscription"); }} />
        <AddonPaymentModal
          open={showHeaderAddon !== null && !freeAccess}
          onClose={() => setShowHeaderAddon(null)}
          addonType={showHeaderAddon ?? "chalet"}
          selectableType
        />
        <Dialog open={accountSettingsOpen} onOpenChange={open => {
          setAccountSettingsOpen(open);
          if (!open && ownerView === "account") {
            navigate(`/dashboard${selectedServiceId ? `?serviceId=${selectedServiceId}` : ""}`, { replace: true });
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6" dir="rtl">
            <DialogHeader className="sr-only">
              <DialogTitle>إعدادات الحساب</DialogTitle>
              <DialogDescription>تعديل بيانات الحساب وكلمة المرور وتفضيلات الإشعارات</DialogDescription>
            </DialogHeader>
            <OwnerProfileTab />
            {canSeeServices && <QuickSalesSettingsPanel readOnly={isReadOnly} />}
          </DialogContent>
        </Dialog>

        {showOwnerEmptyState && activeDashMode !== "owner-services" && <OwnerEmptyState
          requestsOpen={ownerView === "requests"}
          onAdd={() => {
            if (canSeeChalets && canSeeServices) setActivityChoiceOpen(true);
            else addOwnerActivity(canSeeServices ? "service" : "chalet");
          }}
        />}

        {(!showOwnerEmptyState || activeDashMode === "owner-services") && <>
        {activeDashMode === "owner-services" && !actAsStaff && <OwnerServicesOwner />}
        {/* Legacy impersonation navigation; ordinary owners navigate inside the greeting. */}
        {!actAsStaff && isImpersonating && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex flex-wrap items-center gap-1 mb-6 bg-muted rounded-2xl p-1 w-fit max-w-full"
          >
            {/* Chalets mode — hidden for service-only accounts */}
            {canSeeChalets && (
              <button
                onClick={() => setDashMode("chalets")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeDashMode === "chalets"
                    ? "bg-background text-primary shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="w-4 h-4" />
                إدارة عقاراتي
                {(submissions?.length ?? 0) > 0 && (
                  <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-semibold">
                    {toAr(submissions?.length ?? 0)}
                  </span>
                )}
              </button>
            )}
            {/* Services mode — hidden for chalet-only accounts */}
            {canSeeServices && (
              <button
                onClick={() => setDashMode("services")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeDashMode === "services"
                    ? "bg-background text-amber-600 shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Star className="w-4 h-4" />
                إدارة خدماتي
                {(myApprovedProviders.length + myServiceSubmissions.filter(s => s.status === "pending").length) > 0 && (
                  <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5 font-semibold">
                    {toAr(myApprovedProviders.length + myServiceSubmissions.length)}
                  </span>
                )}
              </button>
            )}
            {/* Admin Finance mode — always visible */}
            {hasOperationalActivity && (
              <button
                onClick={() => switchOwnerDashboard("admin-finance")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeDashMode === "admin-finance"
                    ? "bg-background text-slate-700 dark:text-slate-200 shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Briefcase className="w-4 h-4" />
                الشؤون المالية والإدارية
                {!canAccessFinancialAdmin && <Lock className="h-4 w-4" aria-label="يتطلب ترقية الباقة" />}
                {(unreadNotifCount + unreadSupportCount) > 0 && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full px-2 py-0.5 font-semibold">
                    {unreadNotifCount + unreadSupportCount}
                  </span>
                )}
              </button>
            )}
          </motion.div>
        )}

        {activeDashMode === "services" && !actAsStaff && (providersError || serviceSubmissionsError) && (
          <div role="alert" className="mb-5 rounded-2xl border border-destructive/30 bg-card p-6 text-center space-y-3">
            <p className="font-semibold">تعذّر تحميل خدماتك</p>
            <Button variant="outline" onClick={() => { void retryProviders(); void retryServiceSubmissions(); }}>إعادة المحاولة</Button>
          </div>
        )}
        {activeDashMode === "chalets" && (ownerChaletsError || submissionsError) && (
          <div role="alert" className="mb-5 rounded-2xl border border-destructive/30 bg-card p-6 text-center space-y-3">
            <p className="font-semibold">تعذّر تحميل العقارات</p>
            <Button variant="outline" onClick={() => { void retryOwnerChalets(); void retrySubmissions(); }}>إعادة المحاولة</Button>
          </div>
        )}

        {/* ══ SERVICES MODE — Full ERP ═════════════════════════════════ */}
        {activeDashMode === "services" && !actAsStaff && !providersError && !serviceSubmissionsError && (
          <motion.div
            key="services-mode"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {isImpersonating && dashboardSubscription && (freeAccess || !isSubscriptionExpiryWarning(dashboardSubscription)) && (
              <SubscriptionAccountBanner subscription={dashboardSubscription} onManage={() => navigate("/subscription")} />
            )}

            {/* Legacy administrator navigation; owners use the unified toolbar. */}
            {isImpersonating && <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" />
                  خدماتي المستقلة
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">إدارة وتنظيم كافة خدماتك وحجوزاتك بكل سهولة</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap" aria-label="الأقسام العامة للخدمات">
                <Button
                  type="button"
                  variant={serviceView === "manage" && myApprovedProviders.length > 0 ? "default" : "outline"}
                  className="gap-2 rounded-xl"
                  aria-pressed={serviceView === "manage" && myApprovedProviders.length > 0}
                  disabled={myApprovedProviders.length === 0}
                  onClick={() => setServiceView("manage")}
                >
                  <Star className="w-4 h-4" />إدارة الخدمات
                </Button>
                <Button
                  type="button"
                  variant={serviceView === "submissions" || myApprovedProviders.length === 0 ? "default" : "outline"}
                  className="gap-2 rounded-xl"
                  aria-pressed={serviceView === "submissions" || myApprovedProviders.length === 0}
                  onClick={() => setServiceView("submissions")}
                >
                  <Archive className="w-4 h-4" />متابعة الطلبات
                </Button>
              </div>
            </div>}

            {/* Cross-owner shortcut to admin section */}
            {isImpersonating && isCrossOwner && canAccessFinancialAdmin && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-primary font-semibold">
                  <Zap className="w-4 h-4" />
                  الإيرادات والمصروفات والفريق والتقارير في قسم موحّد
                </div>
                <button type="button" onClick={() => setDashMode("admin-finance")}
                  className="text-xs font-bold text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/10 transition-colors flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />انتقل إلى الشؤون المالية والإدارية
                </button>
              </div>
            )}

            {/* Account-wide requests are independent of the selected service. */}
             {serviceView === "submissions" || myApprovedProviders.length === 0 ? (
              <section className="space-y-4" aria-label="متابعة الطلبات لجميع الخدمات">
                <div>
                  <h3 className="text-lg font-bold">متابعة الطلبات</h3>
                  <p className="text-sm text-muted-foreground">عرض الطلبات والتقديمات لجميع خدماتك، وليس للخدمة المختارة فقط.</p>
                </div>
                <ServiceSubmissionsTab
                  onManageCalendar={(providerId) => {
                    selectService(providerId);
                    setSelectedServiceTab("calendar");
                    setServiceView("manage");
                  }}
                  onEditProvider={(providerId) => {
                    selectService(providerId);
                    setSelectedServiceTab("details");
                    setServiceView("manage");
                  }}
                />
              </section>
            ) : (
              <>
                {/* ── Service ERP Dashboard ─────────────────────────── */}
                {selectedFinanceUnit.type === "all" && (
                  <div className="space-y-5">
                    <ServiceManagementNavigation providers={myApprovedProviders} value={selectedServiceTab} onChange={setSelectedServiceTab} quickSalesEnabled={quickSalesEnabled} />
                    {myApprovedProviders.filter(provider =>
                      selectedServiceTab === "insurance" ? hasServiceInsurance(provider) :
                      selectedServiceTab === "digitalContracts" ? provider.requiresContract : true,
                    ).map(provider => <ServiceErpCtx.Provider key={provider.id} value={{ providerId: provider.id }}>
                      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
                        <h3 className="text-lg font-bold">{provider.businessName}</h3>
                        <ServiceManagementContent provider={provider} tab={selectedServiceTab}
                          calendarPreference={ownerProfile?.bookingsCalPref === "gregorian" ? "gregorian" : "hijri"} />
                      </section>
                    </ServiceErpCtx.Provider>)}
                  </div>
                )}
                {selectedFinanceUnit.type !== "all" && selectedServiceId !== null && (() => {
                  const selectedProvider = myApprovedProviders.find(p => p.id === selectedServiceId);
                  if (!selectedProvider) return null;
                  return (
                    <ServiceErpCtx.Provider key={selectedServiceId} value={{ providerId: selectedServiceId }}>
                      <section
                        id={`service-panel-${selectedServiceId}`}
                        aria-labelledby={`service-name-${selectedServiceId}`}
                        className="min-w-0 space-y-5"
                      >
                      {/* Provider header card */}
                      <div className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
                        <ServiceIdentityLogo logoUrl={selectedProvider.logoUrl} name={selectedProvider.businessName} />
                        <div className="flex-1 min-w-0">
                          <p id={`service-name-${selectedServiceId}`} className="text-xl font-extrabold text-foreground">{selectedProvider?.businessName}</p>
                          <p className="text-sm text-muted-foreground">{selectedProvider?.city} · {SERVICE_CATEGORY_LABELS[selectedProvider?.category as keyof typeof SERVICE_CATEGORY_LABELS] ?? selectedProvider?.category}</p>
                        </div>
                        {isImpersonating && myApprovedProviders.length > 1 && (
                          <Select value={String(selectedServiceId)} onValueChange={value => {
                            selectService(Number(value));
                            setSelectedServiceTab("details");
                          }}>
                            <SelectTrigger aria-label="تبديل الخدمة" className="w-full sm:w-52 min-w-0 [&>span]:truncate">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent dir="rtl">
                              {myApprovedProviders.map(provider => (
                                <SelectItem key={provider.id} value={String(provider.id)}>
                                  {provider.businessName}{!provider.isActive ? " (متوقف)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {selectedProvider?.isActive ? (
                            <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-full font-bold">نشط ✓</span>
                          ) : (
                            <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-bold">متوقف</span>
                          )}
                          <Button
                            variant="default"
                            size="sm"
                            className="rounded-lg gap-1.5 text-xs h-8 bg-amber-500 hover:bg-amber-600 text-white"
                            onClick={() => setSelectedServiceTab("details")}
                          >
                            <Edit2 className="w-3.5 h-3.5" />تعديل
                          </Button>
                          <Link href={`/providers/${selectedServiceId}`}>
                            <Button variant="outline" size="sm" className="rounded-lg gap-1.5 text-xs h-8">
                              <Eye className="w-3.5 h-3.5" />معاينة
                            </Button>
                          </Link>
                        </div>
                      </div>

                      {/* ERP Tab bar */}
                      <ServiceManagementNavigation providers={[selectedProvider]} value={selectedServiceTab} onChange={setSelectedServiceTab} quickSalesEnabled={quickSalesEnabled} />

                      {/* ERP Tab Content — core operations only */}
                      <div className="min-h-[300px]">
                        <ServiceManagementContent provider={selectedProvider} tab={selectedServiceTab}
                          calendarPreference={ownerProfile?.bookingsCalPref === "gregorian" ? "gregorian" : "hijri"} />
                      </div>
                      {/* Shortcut to admin-finance */}
                      {isImpersonating && canAccessFinancialAdmin && <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />الإيرادات والمصروفات والموظفون والتقارير → </p>
                        <button type="button" onClick={() => setDashMode("admin-finance")}
                          className="text-xs font-semibold text-primary underline underline-offset-2 hover:opacity-80">
                          الانتقال إلى الشؤون المالية والإدارية
                        </button>
                      </div>}
                      </section>
                    </ServiceErpCtx.Provider>
                  );
                })()}
              </>
            )}
          </motion.div>
        )}

        {/* ══ ADMIN FINANCE MODE ══════════════════════════════════════ */}
        {activeDashMode === "admin-finance" && !actAsStaff && (() => {
          const afTabs = [
            { id: "revenue",       label: "الإيرادات",             icon: <TrendingUp className="w-4 h-4" />,   color: "text-green-600" },
            { id: "ledger",        label: "سجل الحساب البنكي",   icon: <span className="text-base leading-none">🏦</span>, color: "text-blue-600" },
            { id: "expenses",      label: "المصروفات",             icon: <TrendingDown className="w-4 h-4" />, color: "text-red-500" },
            { id: "staff",         label: "الموظفون",              icon: <Users className="w-4 h-4" />,        color: "text-blue-600" },
            { id: "notifications", label: "الإشعارات",             icon: <Bell className="w-4 h-4" />,         color: "text-amber-600" },
            { id: "reports",       label: "التقارير المالية",      icon: <BarChart2 className="w-4 h-4" />,    color: "text-indigo-600" },
            { id: "support",       label: "مركز الدعم",            icon: <MessageSquare className="w-4 h-4" />, color: "text-primary" },
            { id: "history",       label: "سجل المعاملات المالية", icon: <ListChecks className="w-4 h-4" />,    color: "text-slate-600" },
          ] as const;
          return (
            <motion.div key="admin-finance-mode" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Section header */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                    الشؤون المالية والإدارية
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {isCrossOwner ? "لوحة مالية وإدارية موحّدة — عقاراتك وخدماتك في مكان واحد" : "إدارة الماليات والفريق والعملاء والإشعارات"}
                  </p>
                </div>
                {isCrossOwner && (
                  <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3.5 py-2 text-xs text-primary font-semibold">
                    <Zap className="w-3.5 h-3.5" />
                    نظام موحّد — عقارات + خدمات
                  </div>
                )}
              </div>

              {/* Tab bar */}
              <SectionGuideButton sectionKey="adminFinance" />
              <OwnerSubnav highContrast label="تبويبات الشؤون الإدارية والمالية" className="gap-x-1 gap-y-3 pb-3 px-1 pt-1">
                {afTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setAdminFinanceTab(tab.id as any)}
                    aria-pressed={adminFinanceTab === tab.id}
                    className={`relative flex items-center gap-2 px-4 py-3 text-base font-semibold border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                      adminFinanceTab === tab.id
                        ? "border-primary bg-primary/10 text-gray-900 dark:bg-primary/20 dark:text-gray-50"
                        : "border-transparent text-gray-700 hover:bg-gray-200/70 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.id === "notifications" && unreadNotifCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                        {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                      </span>
                    )}
                    {tab.id === "support" && unreadSupportCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                        {unreadSupportCount > 9 ? "9+" : unreadSupportCount}
                      </span>
                    )}
                  </button>
                ))}
              </OwnerSubnav>

              {/* Consolidated banner (shown for "all" view only) */}
              {selectedFinanceUnit.type === "all" && isCrossOwner && (adminFinanceTab === "revenue" || adminFinanceTab === "expenses" || adminFinanceTab === "staff" || adminFinanceTab === "reports") && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-xs text-primary font-semibold flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  {adminFinanceTab === "revenue"  && "الإيرادات الموحّدة — تشمل حجوزات العقارات وإيرادات الخدمات"}
                  {adminFinanceTab === "expenses" && "المصروفات الموحّدة — تشمل مصروفات العقارات والخدمات"}
                  {adminFinanceTab === "staff"    && "فريق العمل الموحّد — جميع الموظفين في عقاراتك وخدماتك"}
                  {adminFinanceTab === "reports"  && "التقارير الإجمالية — تجمع بيانات كل نشاطاتك"}
                </div>
              )}

              {/* Tab content */}
              <AdminFinanceCtx.Provider value={{ unit: selectedFinanceUnit, selectUnit: changeDashboardActivity, expenseActivities: [
                ...ownerChalets.map((property: any): FinanceUnit => ({ type: "chalet", id: property.id, submissionId: property.submissionId, name: property.nameAr || "عقار" })),
                ...myApprovedProviders.map((provider): FinanceUnit => ({ type: "service", id: provider.id, name: provider.businessName })),
              ] }}>
              <div className="min-h-[320px]" key={activityKey(selectedFinanceUnit)}>
                {adminFinanceTab === "revenue"       && <RevenueTab />}
                {adminFinanceTab === "ledger"        && <BankLedgerTab />}
                {adminFinanceTab === "expenses"      && <ExpensesTab />}
                {adminFinanceTab === "staff"         && <StaffTab />}
                {adminFinanceTab === "notifications" && <NotificationsTab />}
                {adminFinanceTab === "reports"       && <ReportsTab properties={ownerChalets} services={myApprovedProviders}
                  activitiesLoading={ownerChaletsLoading || providersLoading} activitiesError={ownerChaletsError || providersError}
                  calendarPreference={ownerProfile?.reportsCalPref === "hijri" ? "hijri" : ownerProfile?.reportsCalPref === "gregorian" ? "gregorian" : undefined} />}
                {adminFinanceTab === "support"       && <OwnerSupportTab />}
                {adminFinanceTab === "history"       && <TransactionHistoryTab />}
              </div>
              </AdminFinanceCtx.Provider>
            </motion.div>
          );
        })()}

        {/* ══ CHALETS MODE ═════════════════════════════════════════════ */}
        {(actAsStaff || (activeDashMode === "chalets" && canSeeChalets)) && !ownerChaletsError && !submissionsError && (
          <>

        {/* Subscription / Account Settings — clickable banner */}
        {(actAsStaff || isImpersonating) && dashboardSubscription && (freeAccess || !isSubscriptionExpiryWarning(dashboardSubscription)) && (
          <SubscriptionAccountBanner subscription={dashboardSubscription} onManage={() => navigate("/subscription")} />
        )}

        {/* Notification Settings — owner only */}
        {!isStaff && !isImpersonating && (
          <NotificationSettingsSection />
        )}

        {/* ── My Services Summary Card (in chalets mode only, hidden for chalet-only accounts) ── */}
        {!actAsStaff && isImpersonating && canSeeServices && activeDashMode === "chalets" && (myServiceSubmissions.length > 0 || myApprovedProviders.length > 0) && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setDashMode("services")}
            className="mb-4 w-full bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap text-sm hover:bg-amber-100/70 dark:hover:bg-amber-900/20 transition-colors text-start cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">خدماتي المستقلة</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {myApprovedProviders.length > 0 && (
                  <span className="text-green-600 dark:text-green-400 font-semibold">{toAr(myApprovedProviders.filter(p => p.isActive).length)} نشط </span>
                )}
                {myServiceSubmissions.filter(s => s.status === "pending").length > 0 && (
                  <span className="text-amber-600 font-semibold">{toAr(myServiceSubmissions.filter(s => s.status === "pending").length)} قيد المراجعة</span>
                )}
                {myApprovedProviders.length === 0 && myServiceSubmissions.filter(s => s.status === "pending").length === 0 && (
                  <span>{toAr(myServiceSubmissions.length)} خدمة مسجلة</span>
                )}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 group-hover:gap-2.5 transition-all">
              إدارة خدماتي
              <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </motion.button>
        )}

        {/* Tabs */}
        {tabs.length > 1 && !propertyRequestsOpen && <OwnerSubnav highContrast label="تبويبات إدارة العقارات" className="gap-x-1 gap-y-1 mb-6 pb-2 px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={visiblePropertyTab === tab.id}
              className={`relative flex items-center gap-2 px-4 py-3 text-base font-semibold border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                visiblePropertyTab === tab.id
                  ? "border-primary bg-primary/10 text-gray-900 dark:bg-primary/20 dark:text-gray-50"
                  : "border-transparent text-gray-700 hover:bg-gray-200/70 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </OwnerSubnav>}

        {/* Tab Content */}
        {visiblePropertyTab === "chalets" && (
          <h2 className="mb-4 text-xl font-bold">{propertyRequestsOpen ? "متابعة الطلبات" : "إدارة عقاراتي"}</h2>
        )}
        {visiblePropertyTab === "chalets" && (
          <ChaletsTab
            key={propertyListView}
            listView={propertyListView}
            submissions={visiblePropertySubmissions}
            isLoading={submissionsLoading || authLoading || impersonationLoading}
            ownerChalets={ownerChalets}
            onRequestAddon={() => setShowHeaderAddon("chalet")}
          />
        )}
        {visiblePropertyTab === "seasons" && <div className="space-y-6">
          {scopedOwnerChalets.map((chalet: any) => <section key={chalet.id} className="space-y-3">
            <h3 className="font-bold">{chalet.nameAr}</h3>
            <SeasonsTab ownerChalets={[chalet]} />
          </section>)}
          {selectedFinanceUnit.type === "all" && myApprovedProviders.map(provider =>
            <ServiceErpCtx.Provider key={provider.id} value={{ providerId: provider.id }}>
              <section className="space-y-3"><h3 className="font-bold">{provider.businessName}</h3><ServiceSeasonsTab /></section>
            </ServiceErpCtx.Provider>)}
        </div>}
        {visiblePropertyTab === "offers" && (
          <PropertyOffersTab
            ownerChalets={scopedOwnerChalets
              .filter(c => Number.isSafeInteger(c.submissionId) && c.submissionId > 0)
              .map(c => ({ id: c.submissionId, nameAr: c.nameAr }))}
            apiFetch={apiFetch}
          />
        )}
        {visiblePropertyTab === "reviews" && (
          <ReviewsTab />
        )}
        {visiblePropertyTab === "services" && (
          <ChaletServicesTab />
        )}
        {visiblePropertyTab === "calendar" && (
          <BookingCalendarTab
            key={activityKey(selectedFinanceUnit)}
            submissions={submissions as any[] ?? []}
            submissionsLoading={submissionsLoading}
            ownerChalets={scopedOwnerChalets}
            chaletsLoading={ownerChaletsLoading}
            preferredReportCalendar={ownerProfile?.reportsCalPref === "gregorian" ? "gregorian"
              : ownerProfile?.reportsCalPref === "hijri" ? "hijri"
              : ownerProfile?.bookingsCalPref === "gregorian" ? "gregorian" : "hijri"}
          />
        )}
        {visiblePropertyTab === "calendar" && selectedFinanceUnit.type === "all" && myApprovedProviders.map(provider =>
          <ServiceErpCtx.Provider key={provider.id} value={{ providerId: provider.id }}>
            <section className="mt-6 space-y-3"><h3 className="text-lg font-bold">{provider.businessName}</h3><ServiceCalendarBookingsTab /></section>
          </ServiceErpCtx.Provider>)}
        {visiblePropertyTab === "deposits" && (
          <DepositsTab />
        )}
        {visiblePropertyTab === "messageSettings" && (
          <OwnerMessageSettingsTab
            establishmentName={ownerChalets[0]?.nameAr}
            chaletNamesBySubmissionId={Object.fromEntries(ownerChalets.map((chalet: any) => [Number(chalet.submissionId), chalet.nameAr]))}
            chaletTermsBySubmissionId={Object.fromEntries(ownerChalets.map((chalet: any) => [Number(chalet.submissionId), chalet.termsAndConditions ?? ""]))}
          />
        )}
        {visiblePropertyTab === "customers" && (
          <AdminFinanceCtx.Provider value={{ unit: selectedFinanceUnit }}>
            <CustomersTab calendarPreference={ownerProfile?.bookingsCalPref === "gregorian" ? "gregorian" : "hijri"} />
          </AdminFinanceCtx.Provider>
        )}
        {visiblePropertyTab === "digitalContracts" && (
          <ContractsArchiveTab />
        )}
          </>
        )}
        </>}
      </div>
    </div>
    </SectionGuideActivityContext.Provider>
    </AdminFinanceCtx.Provider>
    </ImpersonationCtx.Provider>
  );
}
