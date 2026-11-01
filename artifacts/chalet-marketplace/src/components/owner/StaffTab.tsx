import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo, useCallback } from "react";
import { employeeDigits, employeeMobileInput, validEmployeeMobile, validEmployeeNationalId, EMPTY_NEW_STAFF_FORM, STAFF_JOB_TITLES, newStaffForm } from "@/lib/employeeForm";
import type { StaffPermissions } from "@/lib/staffPermissions";
import { HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import { currentSalaryMonth, hasStaffPlatformAccess, paidPayrollRecords, paidPayrollPeriods, payrollPeriod, payrollPeriodLabel } from "@/lib/payrollPeriods";
import { Button } from "@/components/ui/button";
import { User, Plus, CheckCircle, Trash2, Lock, Users, Receipt, Edit2, UserCheck, Loader2, FileText, Settings, Banknote, X, Shield, Briefcase, Check, Printer, ArrowRight, MoreVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toAr, fromAr } from "@/lib/utils";
import { normalizeIdentifier } from "@/lib/authLabels";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeDatePicker } from "@/components/owner/EmployeeDatePicker";
import { Switch } from "@/components/ui/switch";
import { ALL_PERM_KEYS, PERM_LABELS } from "@/lib/staffPermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { StaffHoldingsPanel } from "@/components/owner/StaffHoldingsPanel";
import { useReadOnly } from "@/components/owner/OwnerDashboardContexts";
import { SalaryLog, StaffMember, VoucherData, buildBulkVouchersHtml, buildMasterPayrollHtml, buildSalaryVoucherHtml, nextDueMonth } from "@/components/owner/staff-vouchers";
import { apiFetch } from "@/components/owner/owner-api";
import { GREGORIAN_MONTHS_AR } from "@/components/owner/owner-calendar";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { PaginatedItems, PaginationBar, formatAmount } from "@/components/owner/finance-shared";
import { toArN } from "@/components/owner/owner-formatting";



/* ──────────────────────────────────────────────── */
export function StaffTab() {
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const _nowStaff = new Date();
  const currentMonth = `${_nowStaff.getFullYear()}-${String(_nowStaff.getMonth() + 1).padStart(2, "0")}`;
  /* ── state ── */
  const [addForm, setAddForm] = useState({ ...EMPTY_NEW_STAFF_FORM });
  const [addGrantAccess, setAddGrantAccess] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addPerms, setAddPerms] = useState<StaffPermissions>({});
  const [addAssignType, setAddAssignType] = useState<"all" | "chalet" | "service">("all");
  const [addAssignId, setAddAssignId] = useState<string>("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string; baseSalary: string;
    assignedToType: "all" | "chalet" | "service"; assignedToId: string;
    username: string; password: string;
    nationalId: string; phoneNum: string; birthDate: string; hireDate: string;
    isActive: boolean;
  }>({ name: "", baseSalary: "", assignedToType: "all", assignedToId: "", username: "", password: "", nationalId: "", phoneNum: "", birthDate: "", hireDate: "", isActive: true });
  const [editPerms, setEditPerms] = useState<StaffPermissions>({});
  /* Employee profile slide-over */
  const [staffProfileTarget, setStaffProfileTarget] = useState<any | null>(null);
  const [staffProfileTab, setStaffProfileTab] = useState<"profile" | "finance" | "permissions" | "holdings">("profile");
  const [staffProfileEditing, setStaffProfileEditing] = useState(false);
  /* Permission panel state */
  const [permEditId, setPermEditId] = useState<number | null>(null);
  const [permState, setPermState] = useState<StaffPermissions>({});
  /* Credential edit state */
  const [credEditId, setCredEditId] = useState<number | null>(null);
  const [credForm, setCredForm] = useState({ username: "", password: "" });
  /* Pay dialog */
  const [payTarget, setPayTarget] = useState<StaffMember | null>(null);
  const [payForm, setPayForm] = useState({ month: "", bonus: "0", deduction: "0", bonusNotes: "", deductionNotes: "", generalNotes: "", paymentMethod: "cash" as "cash" | "bank", iban: "" });
  const [payYearState, setPayYearState] = useState<number | null>(null);
  const [payMonthOpen, setPayMonthOpen] = useState(false);
  /* Voucher (shown in dialog after successful payment) */
  const [paidVoucher, setPaidVoucher] = useState<VoucherData | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("معاينة إشعار صرف الراتب");
  const [previewEmpty, setPreviewEmpty] = useState(false);
  const [bulkReportError, setBulkReportError] = useState<string | null>(null);
  /* Bulk print selection */
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set());
  const [masterMonth, setMasterMonth] = useState(currentMonth);
  /* Bulk payroll report modal */
  const [bulkReportOpen, setBulkReportOpen] = useState(false);
  const [bulkReportYear, setBulkReportYear] = useState<number | null>(null);
  const [bulkReportMonth, setBulkReportMonth] = useState<number | null>(null);
  /* Staff table dialogs */
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: number; name: string } | null>(null);
  /* Salary calendar mode — seeded from owner's dedicated salary calendar preference */
  const { data: _staffOwnerProfile } = useQuery<{ salaryCalPref?: string }>({
    queryKey: ["owner", "profile-btype"],
    queryFn: async () => { const r = await apiFetch("/owner/profile"); return r.ok ? r.json() : {}; },
    staleTime: 5 * 60 * 1000,
  });
  const [staffCalMode, setStaffCalMode] = useState<"gregorian" | "hijri">(
    (localStorage.getItem("staffCalDefault") as "gregorian" | "hijri") ?? "gregorian"
  );
  useEffect(() => {
    /* Only seed from DB if localStorage key is absent (first-time user).
       Prevents stale cache (5-min window) from overriding a live user selection. */
    if (_staffOwnerProfile?.salaryCalPref && !localStorage.getItem("staffCalDefault")) {
      const v = _staffOwnerProfile.salaryCalPref as "gregorian" | "hijri";
      localStorage.setItem("staffCalDefault", v);
      setStaffCalMode(v);
    }
  }, [_staffOwnerProfile?.salaryCalPref]);

  /* Live sync: account-settings salary cal pref change fires this event instantly */
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<string>).detail as "gregorian" | "hijri";
      if (v === "gregorian" || v === "hijri") setStaffCalMode(v);
    };
    window.addEventListener("salaryCalPrefChanged", handler);
    return () => window.removeEventListener("salaryCalPrefChanged", handler);
  }, []);
  /* ── month select options (respects staffCalMode) ── */
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let label: string;
      if (staffCalMode === "hijri") {
        const h = toHijriComponents(d);
        label = `${HIJRI_MONTHS_AR[h.month - 1]} ${h.year} هـ`;
      } else {
        label = d.toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
      }
      opts.push({ val: ym, label });
    }
    return opts;
  }, [staffCalMode]);

  /* ── salary month label (respects staffCalMode) ── */
  const salaryMonthLabel = useCallback((ym: string) => {
    return payrollPeriodLabel(ym, staffCalMode);
  }, [staffCalMode]);

  /* Explicit SAR formatter — guarantees ر.س without relying on ICU locale data */
  const fmtSAR = (n: number) => `${Number(n).toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س`;

  /* ── Pay dialog: year/month computed values ── */
  const payDateParsed = useMemo(() => {
    if (!payForm.month) {
      const fallback = payYearState ?? (staffCalMode === "hijri"
        ? toHijriComponents(new Date()).year
        : new Date().getFullYear());
      return { year: fallback, monthIdx: -1 };
    }
    const d = new Date(payForm.month + "-15");
    if (staffCalMode === "hijri") {
      const h = toHijriComponents(d);
      return { year: h.year, monthIdx: h.month - 1 };
    }
    return { year: d.getFullYear(), monthIdx: d.getMonth() };
  }, [payForm.month, payYearState, staffCalMode]);

  const payYearOptions = useMemo(() => {
    if (staffCalMode === "hijri") {
      const cy = toHijriComponents(new Date()).year;
      return [cy - 1, cy, cy + 1, cy + 2];
    }
    const cy = new Date().getFullYear();
    return [cy - 1, cy, cy + 1, cy + 2];
  }, [staffCalMode]);

  const payMonthLabels = useMemo(() => {
    if (staffCalMode === "hijri") return HIJRI_MONTHS_AR;
    return GREGORIAN_MONTHS_AR;
  }, [staffCalMode, payDateParsed.year]);

  const applyPayDate = (year: number, monthIdx: number) => {
    let ym: string;
    if (staffCalMode === "hijri") {
      const approxGreg = Math.round(year * 0.9702 + 621.57);
      let found = false;
      outer: for (let y = approxGreg - 1; y <= approxGreg + 2; y++) {
        for (let m = 1; m <= 12; m++) {
          const h = toHijriComponents(new Date(y, m - 1, 15));
          if (h.year === year && h.month === monthIdx + 1) {
            ym = `${y}-${String(m).padStart(2, "0")}`;
            found = true;
            break outer;
          }
        }
      }
      if (!found) ym = `${approxGreg}-01`;
    } else {
      ym = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    }
    setPayForm(f => ({ ...f, month: ym! }));
  };

  /* ── queries ── */
  const { data: staff = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ["owner", "staff"],
    queryFn: async () => { const r = await apiFetch("/owner/staff"); if (!r.ok) return []; return r.json(); },
  });

  const { data: staffChalets = [] } = useQuery<{ id: number; nameAr: string | null; submissionId: number | null }[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => { const r = await apiFetch("/owner/chalets"); if (!r.ok) return []; return r.json(); },
    staleTime: 60_000,
  });

  const { data: staffProviders = [] } = useQuery<{ id: number; businessName: string }[]>({
    queryKey: ["my-approved-providers"],
    queryFn: async () => { const r = await apiFetch("/providers/my/approved"); if (!r.ok) return []; return r.json(); },
    staleTime: 60_000,
  });

  const { data: history = [], isLoading: histLoading } = useQuery<SalaryLog[]>({
    queryKey: ["owner", "salary-logs-history"],
    queryFn: async () => { const r = await apiFetch("/owner/salary-logs/history"); if (!r.ok) return []; return r.json(); },
  });
  const paidHistory = useMemo(() => paidPayrollRecords(history), [history]);
  const bulkPeriods = useMemo(() => paidPayrollPeriods(history, staffCalMode), [history, staffCalMode]);
  const bulkYearOptions = [...new Set(bulkPeriods.map(period => period.year))];
  const bulkMonthOptions = bulkPeriods.filter(period => period.year === bulkReportYear).map(period => period.month);
  const bulkPeriodAvailable = bulkReportYear !== null && bulkReportMonth !== null
    && bulkPeriods.some(period => period.year === bulkReportYear && period.month === bulkReportMonth);

  useEffect(() => {
    setBulkReportYear(null);
    setBulkReportMonth(null);
    setBulkReportError(null);
  }, [staffCalMode]);

  useEffect(() => {
    if (histLoading) return;
    if (bulkReportYear !== null && !bulkPeriods.some(period => period.year === bulkReportYear)) {
      setBulkReportYear(null);
      setBulkReportMonth(null);
    } else if (bulkReportMonth !== null && !bulkPeriods.some(period => period.year === bulkReportYear && period.month === bulkReportMonth)) {
      setBulkReportMonth(null);
    }
  }, [bulkPeriods, bulkReportYear, bulkReportMonth, histLoading]);

  /* ── mutations ── */
  const addStaff = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/owner/staff", { method: "POST", body: JSON.stringify(data) });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error ?? "تعذّر إضافة الموظف");
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "staff"] });
      setAddForm({ ...EMPTY_NEW_STAFF_FORM });
      setAddGrantAccess(false);
      setAddPerms({});
      setAddAssignType("all");
      setAddAssignId("");
      setShowAddStaff(false);
      toast({ title: "تمت إضافة الموظف التشغيلي", description: "حُفظ الموظف لحساب الرواتب والمصروفات دون صلاحية دخول للمنصة." });
    },
    onError: (error: Error) => toast({ title: "لم تتم إضافة الموظف", description: error.message, variant: "destructive" }),
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ id, permissions }: { id: number; permissions: StaffPermissions }) => {
      const r = await apiFetch(`/owner/staff/${id}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "staff"] }); setPermEditId(null); },
  });

  const updateCredentials = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { username?: string; password?: string } }) => {
      const r = await apiFetch(`/owner/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "staff"] }); setCredEditId(null); },
  });

  const editStaff = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiFetch(`/owner/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل حفظ بيانات الموظف");
      return r.json();
    },
    onSuccess: (updatedEmp) => {
      qc.invalidateQueries({ queryKey: ["owner", "staff"] });
      setEditId(null);
      setStaffProfileEditing(false);
      if (updatedEmp) setStaffProfileTarget(updatedEmp);
    },
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/owner/staff/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const result = await r.json().catch(() => ({}));
        throw new Error(result.error || "تعذّر حذف الموظف");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "staff"] }),
    onError: (error: Error) => toast({ title: "تعذّر حذف الموظف", description: error.message, variant: "destructive" }),
  });

  const paySalary = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/owner/salary-logs/pay", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) {
        const error = await r.json().catch(() => null);
        throw new Error(error?.error || "فشل صرف الراتب");
      }
      return r.json() as Promise<{ salaryLog: any; expense: any }>;
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["owner", "salary-logs-history"] });
      qc.invalidateQueries({ queryKey: ["owner", "salary-logs"] });
      qc.invalidateQueries({ queryKey: ["owner", "expenses"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
      qc.invalidateQueries({ queryKey: ["owner", "transaction-history"] });
      /* Build voucher data from the result + payTarget context */
      if (payTarget) {
        const base  = Number(payTarget.baseSalary);
        const bonus = variables.bonus ?? 0;
        const deduction = variables.deduction ?? 0;
        const net   = base + bonus - deduction;
        const paidAt = result.salaryLog?.paidAt ?? new Date().toISOString();
        const logId  = result.salaryLog?.id as number | undefined;
        const voucherNo = `SAL-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,"0")}-${payTarget.id}`;
        setPaidVoucher({
          voucherNo,
          logId,
          staffName:     payTarget.name,
          ownerName:     [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل",
          month:         variables.month,
          paidAt,
          baseSalary:    base,
          bonus,
          deduction,
          net,
          notes:         variables.notes,
          bonusNotes:    payForm.bonusNotes || undefined,
          deductionNotes: payForm.deductionNotes || undefined,
          generalNotes:  payForm.generalNotes || undefined,
          paymentMethod: payForm.paymentMethod,
          iban:          payForm.paymentMethod === "bank" ? payForm.iban : undefined,
        });
      }
      setPayForm({ month: "", bonus: "0", deduction: "0", bonusNotes: "", deductionNotes: "", generalNotes: "", paymentMethod: "cash", iban: "" });
      setPayYearState(null);
    },
    onError: (error: Error) => {
      void qc.invalidateQueries({ queryKey: ["owner", "salary-logs-history"] });
      void qc.invalidateQueries({ queryKey: ["owner", "expenses"] });
      toast({ title: "تعذر صرف الراتب", description: error.message, variant: "destructive" });
    },
  });

  /* ── per-staff computed stats from history ── */
  const staffStats = useMemo(() => {
    const map: Record<number, { totalEarned: number; lastPaidMonth: string | null }> = {};
    for (const log of history) {
      if (!map[log.staffId]) map[log.staffId] = { totalEarned: 0, lastPaidMonth: null };
      const base = Number((log as any).baseSalary ?? 0);
      const net = base + Number(log.bonus) - Number(log.deduction);
      map[log.staffId].totalEarned += net;
      const prev = map[log.staffId].lastPaidMonth;
      if (!prev || log.month > prev) map[log.staffId].lastPaidMonth = log.month;
    }
    return map;
  }, [history]);

  /* ── pay dialog net salary ── */
  const payNet = payTarget
    ? Number(payTarget.baseSalary) + (parseFloat(payForm.bonus) || 0) - (parseFloat(payForm.deduction) || 0)
    : 0;

  /* ── mock data shown when no real records yet ── */
  const MOCK_STAFF_ITEM: StaffMember & {
    assignedToType: "chalet";
    assignedToId: null;
    assignedToName: string;
  } = {
    id: -1, name: "محمد أحمد", baseSalary: "4000", username: null,
    isActive: true, createdAt: "2026-01-01T00:00:00.000Z",
    permissions: { manageBookings: true } as StaffPermissions,
    assignedToType: "chalet" as const, assignedToId: null, assignedToName: "شاليه الياسمين",
  };
  const MOCK_HISTORY_ITEM = {
    id: -1, staffId: -1, staffName: "محمد أحمد", month: "2026-05",
    baseSalary: "4000", bonus: "500", deduction: "0",
    notes: "راتب شهر مايو", paidAt: "2026-06-01T10:00:00.000Z",
  };
  const displayStaff  = isLoading   ? [] : staff.length   > 0 ? staff   : [MOCK_STAFF_ITEM];
  const displayHistory = histLoading ? [] : history.length > 0 ? history : [MOCK_HISTORY_ITEM];

  return (
    <div className="staff-screen space-y-5">
      <SectionGuideButton sectionKey="employees" />
      {/* ── Add Staff Button ── */}
      <div className="flex justify-start">
        <Button onClick={() => {
          setAddForm(newStaffForm());
          setShowAddStaff(true);
        }} className="h-10 px-5 font-bold">
          <Plus className="w-4 h-4 me-1.5" />
          إضافة موظف جديد
        </Button>
      </div>

      {/* ── Add Staff Modal ── */}
      <Dialog open={showAddStaff} onOpenChange={(open) => {
        if (!open && !addStaff.isPending) {
          setShowAddStaff(false);
          setAddForm({ ...EMPTY_NEW_STAFF_FORM });
          setAddGrantAccess(false);
          setAddPerms({});
          setAddAssignType("all");
          setAddAssignId("");
        }
      }}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCheck className="w-4 h-4 text-primary" />
              إضافة موظف جديد
            </DialogTitle>
            <DialogDescription>أدخل بيانات الموظف ثم اضغط حفظ</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isReadOnly) { onBlockedEdit(); return; }
              const salaryText = fromAr(addForm.baseSalary).trim().replace(/[٬,]/g, "").replace("٫", ".");
              const s = Number(salaryText);
              const phone = normalizeIdentifier(addForm.phoneNum);
              if (!addForm.name.trim() || !salaryText || !Number.isFinite(s) || s < 0 || s > 99_999_999.99 || !/^05\d{8}$/.test(addForm.phoneNum) || phone.kind !== "phone") {
                toast({ title: "تحقق من بيانات الموظف", description: "الاسم الكامل ورقم جوال سعودي صحيح والراتب الأساسي غير السالب حقول مطلوبة.", variant: "destructive" });
                return;
              }
              if (!validEmployeeNationalId(addForm.nationalId)) {
                toast({ title: "رقم الهوية / الإقامة غير مكتمل", description: "أدخل ١٠ أرقام بالضبط أو اترك الحقل الاختياري فارغًا.", variant: "destructive" });
                return;
              }
              const jobTitle = addForm.jobTitle === "other" ? addForm.customJobTitle.trim() : addForm.jobTitle;
              if (addForm.jobTitle === "other" && !jobTitle) {
                toast({ title: "المسمى الوظيفي مطلوب", description: "أدخل المسمى الوظيفي عند اختيار «أخرى».", variant: "destructive" });
                return;
              }
              if (addAssignType !== "all" && !(
                addAssignType === "chalet"
                  ? staffChalets.some(unit => String(unit.id) === addAssignId)
                  : staffProviders.some(provider => String(provider.id) === addAssignId)
              )) {
                toast({ title: "اختر الوحدة المكلّفة", description: "يجب اختيار وحدة أو خدمة من القائمة قبل حفظ الموظف.", variant: "destructive" });
                return;
              }
              addStaff.mutate({
                name: addForm.name.trim(),
                baseSalary: s,
                grantAccess: addGrantAccess,
                permissions: addGrantAccess ? addPerms : {},
                assignedToType: addAssignType,
                assignedToId: addAssignType !== "all" && addAssignId ? Number(addAssignId) : undefined,
                nationalId: addForm.nationalId || undefined,
                jobTitle: jobTitle || undefined,
                email: addForm.email.trim() || undefined,
                phoneNum: phone.value,
                birthDate: addForm.birthDate || undefined,
                hireDate: addForm.hireDate || undefined,
              });
            }}
            className="space-y-4"
          >
            {/* Basic Info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="new-staff-name">الاسم الكامل <span className="text-destructive">*</span></Label>
                <Input id="new-staff-name" placeholder="الاسم الكامل" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="h-11" required disabled={addStaff.isPending} autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-staff-phone">رقم الجوال <span className="text-destructive">*</span></Label>
                <Input id="new-staff-phone" type="text" placeholder="٠٥٠٠٠٠٠٠٠٠" value={toAr(addForm.phoneNum)} onChange={(e) => setAddForm((f) => ({ ...f, phoneNum: employeeMobileInput(e.target.value) }))} className="h-11" inputMode="numeric" minLength={10} pattern="٠٥[٠-٩]{8}" title="أدخل ١٠ أرقام تبدأ بـ ٠٥" dir="ltr" autoComplete="tel-national" required disabled={addStaff.isPending} />
                <p className="text-xs text-muted-foreground">المرجع الأساسي للموظف، ويُستخدم لدعوة التفعيل عند منحه دخولاً.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-staff-salary">الراتب الأساسي (ر.س) <span className="text-destructive">*</span></Label>
                <Input id="new-staff-salary" type="text" inputMode="decimal" placeholder="الراتب الأساسي (ر.س)" value={toAr(addForm.baseSalary)} onChange={(e) => setAddForm((f) => ({ ...f, baseSalary: fromAr(e.target.value) }))} className="h-11" required disabled={addStaff.isPending} />
                <p className="text-xs text-muted-foreground">لحساب الرواتب والمصروفات والتقارير المالية.</p>
              </div>
            </div>

            {/* Personal Info */}
            <div className="border border-border/60 rounded-xl p-4 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> البيانات الشخصية <span className="font-normal">(اختياري)</span>
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 items-start">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="new-staff-job-title" className="text-xs text-muted-foreground">المسمى الوظيفي</Label>
                  <Select value={addForm.jobTitle || "none"} disabled={addStaff.isPending} onValueChange={(value) => setAddForm((f) => ({ ...f, jobTitle: value === "none" ? "" : value, customJobTitle: "" }))}>
                    <SelectTrigger id="new-staff-job-title" className="h-10 w-full text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون مسمى وظيفي</SelectItem>
                      {STAFF_JOB_TITLES.map((title) => <SelectItem key={title} value={title}>{title}</SelectItem>)}
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                  {addForm.jobTitle === "other" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="new-staff-custom-job-title" className="text-xs text-muted-foreground">اكتب المسمى الوظيفي</Label>
                      <Input id="new-staff-custom-job-title" placeholder="المسمى الوظيفي" value={addForm.customJobTitle} onChange={(e) => setAddForm((f) => ({ ...f, customJobTitle: e.target.value }))} maxLength={120} className="h-10 text-sm" required disabled={addStaff.isPending} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="new-staff-email" className="text-xs text-muted-foreground">البريد الإلكتروني (اختياري)</Label>
                  <Input id="new-staff-email" type="email" placeholder="البريد الإلكتروني" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} maxLength={254} className="h-10 text-sm" dir="ltr" autoComplete="email" disabled={addStaff.isPending} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="new-staff-national-id" className="text-xs text-muted-foreground">رقم الهوية / الإقامة</Label>
                  <Input id="new-staff-national-id" placeholder="١٠ أرقام" value={toAr(addForm.nationalId)} onChange={(e) => setAddForm((f) => ({ ...f, nationalId: employeeDigits(e.target.value) }))} className="h-10 text-sm" type="text" inputMode="numeric" minLength={10} pattern="[٠-٩]{10}" title="رقم الهوية / الإقامة يتكون من ١٠ أرقام بالضبط" dir="ltr" disabled={addStaff.isPending} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label className="text-xs text-muted-foreground block">تاريخ التعيين</label>
                  <EmployeeDatePicker
                    kind="hire"
                    value={addForm.hireDate}
                    onChange={(value) => setAddForm((f) => ({ ...f, hireDate: value }))}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label className="text-xs text-muted-foreground block">تاريخ الميلاد</label>
                  <EmployeeDatePicker
                    kind="birth"
                    value={addForm.birthDate}
                    onChange={(value) => setAddForm((f) => ({ ...f, birthDate: value }))}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Unit Assignment */}
            {(staffChalets.length > 0 || staffProviders.length > 0) && (
              <div className="border border-border/60 rounded-xl p-4 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" /> الوحدة المكلّفة
                </p>
                <div className="space-y-3">
                  <Select value={addAssignType} onValueChange={(v) => { setAddAssignType(v as any); setAddAssignId(""); }}>
                    <SelectTrigger className="h-10 flex-1 min-w-[130px] text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الوحدات</SelectItem>
                      {staffChalets.length > 0 && <SelectItem value="chalet">وحدة محددة</SelectItem>}
                      {staffProviders.length > 0 && <SelectItem value="service">خدمة محدّدة</SelectItem>}
                    </SelectContent>
                  </Select>
                  {addAssignType === "chalet" && staffChalets.length > 0 && (
                    <div className="space-y-1.5">
                    <Label htmlFor="new-staff-unit">اختر العقار / الوحدة <span className="text-destructive">*</span></Label>
                    <Select dir="rtl" value={addAssignId} onValueChange={setAddAssignId} disabled={addStaff.isPending}>
                      <SelectTrigger id="new-staff-unit" className="h-10 w-full text-sm"><SelectValue placeholder="اختر من وحداتك المسجلة" /></SelectTrigger>
                      <SelectContent position="popper" className="z-[100]">
                        {staffChalets.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nameAr ?? `عقار #${c.id}`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    </div>
                  )}
                  {addAssignType === "service" && staffProviders.length > 0 && (
                    <Select value={addAssignId} onValueChange={setAddAssignId}>
                      <SelectTrigger className="h-10 flex-1 min-w-[150px] text-sm"><SelectValue placeholder="اختر الخدمة" /></SelectTrigger>
                      <SelectContent>
                        {staffProviders.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.businessName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            )}

            <div className="border border-border/60 rounded-xl p-4 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="new-staff-grant-access" className="cursor-pointer">منح الموظف صلاحية دخول للمنصة</Label>
                <Switch
                  id="new-staff-grant-access"
                  checked={addGrantAccess}
                  disabled={addStaff.isPending}
                  onCheckedChange={(enabled) => {
                    setAddGrantAccess(enabled);
                    if (!enabled) setAddPerms({});
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {addGrantAccess
                  ? "بعد توفر خدمة واتساب، تُرسل دعوة تفعيل إلى الجوال المدخل ليعيّن الموظف كلمة مروره بنفسه ويستخدم الصلاحيات المحددة فقط."
                  : "يُضاف كموظف تشغيلي لحساب الرواتب والمصروفات، دون بيانات دخول أو صلاحيات على المنصة."}
              </p>
              {addGrantAccess && (
                <p role="status" className="text-xs text-amber-700 dark:text-amber-400">إرسال دعوات التفعيل يتطلب ربط خدمة واتساب. لن يُحفظ حساب دخول حتى تصبح الخدمة متاحة.</p>
              )}
            </div>

            {/* Permissions */}
            {addGrantAccess && <div className="border border-border/60 rounded-xl p-4 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" /> صلاحيات الموظف
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ALL_PERM_KEYS.map((key) => {
                  const info = PERM_LABELS[key];
                  return (
                    <label key={key} className="flex items-start gap-3 cursor-pointer group">
                      <Switch
                        checked={!!addPerms[key]}
                        onCheckedChange={(v) => setAddPerms((p) => ({ ...p, [key]: v }))}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="text-xs">
                        <span className="font-semibold text-foreground">{info.icon} {info.label}</span>
                        <span className="block text-muted-foreground mt-0.5">{info.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>}

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" disabled={addStaff.isPending} onClick={() => {
                setShowAddStaff(false);
                setAddForm({ ...EMPTY_NEW_STAFF_FORM });
                setAddGrantAccess(false);
                setAddPerms({});
                setAddAssignType("all");
                setAddAssignId("");
              }} className="h-10">إلغاء</Button>
              <Button type="submit" className="h-10 px-5 font-bold" disabled={addStaff.isPending}>
                {addStaff.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Plus className="w-4 h-4 me-1.5" />}
                حفظ الموظف
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Staff Cards ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          الموظفون
        </h2>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
        ) : (
          <PaginatedItems items={displayStaff} resetKey={displayStaff.map(member => member.id).join("|")}>
            {(pagination) => (
              <div ref={pagination.tableRef} className="rounded-xl overflow-hidden border border-border/40 scroll-mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] table-fixed border-collapse staff-main-table" dir="rtl">
              <colgroup>
                <col className="w-[23%]" />
                <col className="w-[16%]" />
                <col className="w-[21%]" />
                <col className="w-[16%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead>
                <tr className="bg-muted/60 border-b border-border/40">
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">الاسم</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">الراتب الأساسي</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">الوحدة المكلّفة</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">صلاحية المنصة</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">الإجراءات السريعة</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((member, idx) => {
                  const isMock = (member.id as number) < 0;
                  const unitLabel = (member as any).assignedToName
                    ?? ((member as any).assignedToType === "chalet"
                      ? (staffChalets.find((c) => c.id === (member as any).assignedToId)?.nameAr ?? "عقار")
                      : (member as any).assignedToType === "service"
                      ? (staffProviders.find((p) => p.id === (member as any).assignedToId)?.businessName ?? "خدمة")
                      : "جميع الوحدات");
                  const nextDue = nextDueMonth((staffStats[member.id] ?? { lastPaidMonth: null }).lastPaidMonth);
                  return (
                    <tr
                      key={member.id}
                      className={`transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/20"} border-b border-border/20 last:border-0 ${isMock ? "opacity-60" : ""}`}
                    >
                      <td className="text-right px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p
                              className="text-sm font-semibold text-foreground leading-tight cursor-pointer hover:text-primary transition-colors"
                              title="ملف الموظف"
                              onClick={() => { if (!isMock) { setStaffProfileTab("profile"); setStaffProfileTarget(member); setStaffProfileEditing(false); } }}
                            >{member.name}</p>
                            {!isMock && member.username && <p className="text-[10px] text-muted-foreground">@{member.username}</p>}
                            {isMock && <p className="text-[10px] text-amber-600 font-medium">بيانات تجريبية</p>}
                          </div>
                        </div>
                      </td>
                      <td className="text-right px-3 py-3">
                        <p className="text-sm font-bold text-foreground">{formatAmount(Number(member.baseSalary))}</p>
                      </td>
                      <td className="text-right px-3 py-3">
                        <span className="text-xs text-muted-foreground">{unitLabel}</span>
                      </td>
                      <td className="text-right px-3 py-3">
                        <button
                          type="button"
                          disabled={isMock}
                          aria-label={`صلاحية المنصة — ${member.name}: ${hasStaffPlatformAccess(member) ? "مفعلة" : "غير مفعلة"}`}
                          onClick={() => { setStaffProfileTab("permissions"); setStaffProfileTarget(member); setStaffProfileEditing(false); }}
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${hasStaffPlatformAccess(member) ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
                        >
                          {hasStaffPlatformAccess(member) ? "مفعلة" : "غير مفعلة"}
                        </button>
                      </td>
                      <td className="text-right px-3 py-3">
                        {!isMock ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              className="h-7 px-3 text-[11px] font-bold"
                              onClick={() => {
                                const month = currentSalaryMonth();
                                setPayTarget(member);
                                setPaidVoucher(null);
                                setPayYearState(payrollPeriod(month, staffCalMode)!.year);
                                setPayForm({ month, bonus: "0", deduction: "0", bonusNotes: "", deductionNotes: "", generalNotes: "", paymentMethod: "cash", iban: "" });
                              }}
                            >
                              <Banknote className="w-3 h-3 me-1" />
                              صرف الراتب
                            </Button>
                            <DropdownMenu dir="rtl">
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label={`إجراءات الموظف ${member.name}`}>
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onSelect={() => { setStaffProfileTab("profile"); setStaffProfileTarget(member); setStaffProfileEditing(false); }}>
                                  الملف الشخصي
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => { setStaffProfileTab("finance"); setStaffProfileTarget(member); setStaffProfileEditing(false); }}>
                                  السجل المالي
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => { setStaffProfileTab("holdings"); setStaffProfileTarget(member); setStaffProfileEditing(false); }}>
                                  العهد والودائع
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => { setStaffProfileTab("permissions"); setStaffProfileTarget(member); setStaffProfileEditing(false); }}>
                                  صلاحية المنصة
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
                  </table>
                </div>
                <PaginationBar
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  totalItems={displayStaff.length}
                  totalPages={pagination.totalPages}
                  onPageChange={pagination.goToPage}
                  onPageSizeChange={pagination.changePageSize}
                />
              </div>
            )}
          </PaginatedItems>
        )}
      </div>

      {/* ── Payment History Table ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              سجل صرف الرواتب
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => { setBulkReportYear(null); setBulkReportMonth(null); setBulkReportError(null); setBulkReportOpen(true); }}
            >
              <FileText className="w-3.5 h-3.5" />
              إصدار مسير الرواتب
            </Button>
            {selectedLogIds.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => {
                  const ownerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل";
                  const selected = (history as any[]).filter((l) => selectedLogIds.has(l.id));
                  const html = buildBulkVouchersHtml(selected, ownerName, staffCalMode);
                  if (html) setPreviewHtml(html);
                }}
              >
                <Receipt className="w-3.5 h-3.5" />
                طباعة المسيرات ({selectedLogIds.size})
              </Button>
            )}
          </div>
        </div>
        {histLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
        ) : (
          <PaginatedItems items={displayHistory} resetKey={displayHistory.map(log => log.id).join("|")}>
            {(pagination) => (
              <div ref={pagination.tableRef} className="rounded-xl overflow-hidden border border-border/40 scroll-mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-sm staff-payroll-table" dir="rtl">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[17%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-muted/60 border-b border-border/40 text-muted-foreground text-[10px]">
                  <th className="px-2 py-2">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-primary"
                      checked={selectedLogIds.size === displayHistory.length && displayHistory.length > 0 && !histLoading}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedLogIds(new Set((displayHistory as any[]).filter(l => (l.id as number) > 0).map((l) => l.id)));
                        else setSelectedLogIds(new Set());
                      }}
                    />
                  </th>
                  <th className="text-right font-semibold px-3 py-2">الموظف</th>
                  <th className="text-right font-semibold px-3 py-2">الشهر</th>
                  <th className="text-right font-semibold px-3 py-2">الأساسي</th>
                  <th className="text-right font-semibold px-3 py-2">مكافأة</th>
                  <th className="text-right font-semibold px-3 py-2">خصم</th>
                  <th className="text-right font-semibold px-3 py-2">الصافي</th>
                  <th className="text-right font-semibold px-3 py-2">تاريخ الصرف</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((log, idx) => {
                  const isMock = (log.id as number) < 0;
                  const base = Number((log as any).baseSalary ?? 0);
                  const bonus = Number(log.bonus);
                  const deduction = Number(log.deduction);
                  const net = base + bonus - deduction;
                  const paidAtStr = log.paidAt ? String(log.paidAt) : new Date().toISOString();
                  const voucherNo = `SAL-${log.month.replace("-","")}-${log.staffId}`;
                  const isSelected = selectedLogIds.has(log.id);
                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0 ${isSelected ? "bg-primary/5" : idx % 2 !== 0 ? "bg-muted/20" : ""} ${isMock ? "opacity-60" : ""}`}
                    >
                      <td className="px-2 py-2.5 text-center">
                        {!isMock ? (
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded accent-primary"
                            checked={isSelected}
                            onChange={(e) => {
                              const next = new Set(selectedLogIds);
                              if (e.target.checked) next.add(log.id);
                              else next.delete(log.id);
                              setSelectedLogIds(next);
                            }}
                          />
                        ) : (
                          <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary opacity-30" disabled />
                        )}
                      </td>
                      <td className="text-right px-3 py-2.5 font-semibold text-foreground">
                        {(log as any).staffName ?? "—"}
                        {isMock && <span className="block text-[10px] text-amber-600 font-normal">تجريبي</span>}
                      </td>
                      <td className="text-right px-3 py-2.5 text-muted-foreground">{salaryMonthLabel(log.month)}</td>
                      <td className="text-right px-3 py-2.5">{fmtSAR(base)}</td>
                      <td className="text-right px-3 py-2.5 text-green-600">{bonus > 0 ? `+${fmtSAR(bonus)}` : "—"}</td>
                      <td className="text-right px-3 py-2.5 text-red-600">{deduction > 0 ? `-${fmtSAR(deduction)}` : "—"}</td>
                      <td className="text-right px-3 py-2.5 font-bold text-foreground">{fmtSAR(net)}</td>
                      <td className="text-right px-3 py-2.5 text-muted-foreground text-xs">
                        {log.paidAt ? (() => {
                          const d = new Date(paidAtStr);
                          const h = toHijriComponents(d);
                          const greg = d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
                          return (
                            <span>
                              <span className="block font-medium text-foreground">{toArN(h.day)} {HIJRI_MONTHS_AR[h.month - 1]} {toArN(h.year)} هـ</span>
                              <span className="block text-[10px] text-muted-foreground">{greg} م</span>
                            </span>
                          );
                        })() : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {!isMock ? (
                          <button
                            onClick={() => {
                              const html = buildSalaryVoucherHtml({
                                voucherNo,
                                logId:          log.id,
                                staffName:      (log as any).staffName ?? "موظف",
                                ownerName:      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل",
                                month:          log.month,
                                paidAt:         paidAtStr,
                                baseSalary:     base,
                                bonus,
                                deduction,
                                net,
                                notes:          log.notes ?? undefined,
                                bonusNotes:     (log as any).bonusNotes ?? undefined,
                                deductionNotes: (log as any).deductionNotes ?? undefined,
                              }, staffCalMode);
                              setPreviewHtml(html);
                            }}
                            className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap"
                          >
                            <Receipt className="w-3 h-3" />
                            طباعة
                          </button>
                        ) : <span />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
                  </table>
                </div>
                <PaginationBar
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  totalItems={displayHistory.length}
                  totalPages={pagination.totalPages}
                  onPageChange={pagination.goToPage}
                  onPageSizeChange={pagination.changePageSize}
                />
              </div>
            )}
          </PaginatedItems>
        )}
      </div>

      {/* ── Pay Salary Dialog ── */}
      <Dialog
        open={!!payTarget}
        onOpenChange={(open) => {
          if (!open) { setPayTarget(null); setPaidVoucher(null); }
        }}
      >
        <DialogContent className="sm:max-w-sm max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden" dir="rtl">
          {/* ── Success / Voucher state ── */}
          {paidVoucher ? (
            <>
              <div className="shrink-0 px-6 pt-6 pb-2">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-right text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    تم صرف الراتب بنجاح
                  </DialogTitle>
                  <DialogDescription className="text-right text-xs">
                    تمت إضافة الراتب تلقائياً في المصروفات تحت بند الرواتب.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 pt-2">
                {/* Mini summary */}
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الموظف</span>
                    <span className="font-semibold">{paidVoucher.staffName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الشهر</span>
                    <span className="font-semibold">{salaryMonthLabel(paidVoucher.month)}</span>
                  </div>
                  <div className="flex justify-between border-t border-green-200 dark:border-green-800 pt-2 font-bold">
                    <span>صافي الراتب</span>
                    <span className="text-green-700 dark:text-green-400 text-base">{formatAmount(paidVoucher.net)}</span>
                  </div>
                </div>
                <Button
                  className="w-full h-11 font-bold"
                  onClick={() => { const html = buildSalaryVoucherHtml(paidVoucher, staffCalMode); setPreviewHtml(html); }}
                >
                  <Receipt className="w-4 h-4 me-2" />
                  معاينة إشعار صرف الراتب
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => { setPayTarget(null); setPaidVoucher(null); }}
                >
                  إغلاق
                </Button>
              </div>
            </>
          ) : (
            /* ── Pay Form state ── */
            <>
              <div className="shrink-0 px-6 pt-6 pb-2">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-right">
                    <Banknote className="w-5 h-5 text-primary" />
                    صرف راتب – {payTarget?.name}
                  </DialogTitle>
                  <DialogDescription className="text-right text-xs">
                    سيتم تسجيل الراتب تلقائياً ضمن المصروفات تحت بند الرواتب.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pt-2 pb-2 space-y-4">
                {/* Date picker: Year + Month inline — driven by salary cal pref from account settings */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">الفترة</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={payYearState !== null ? String(payYearState) : ""}
                      onChange={(e) => {
                        const y = Number(e.target.value);
                        setPayYearState(y);
                        setPayForm(f => ({ ...f, month: "" }));
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-right"
                      dir="rtl"
                    >
                      <option value="" disabled>اختر السنة</option>
                      {payYearOptions.map(y => (
                        <option key={y} value={String(y)}>
                          {staffCalMode === "hijri" ? `${toArN(y)} هـ` : `${toArN(y)} م`}
                        </option>
                      ))}
                    </select>
                    <select
                      value={payForm.month ? String(payDateParsed.monthIdx) : ""}
                      onChange={(e) => {
                        if (payYearState === null) return;
                        applyPayDate(payYearState, Number(e.target.value));
                      }}
                      disabled={payYearState === null}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-right disabled:opacity-50 disabled:cursor-not-allowed"
                      dir="rtl"
                    >
                      <option value="" disabled>اختر الشهر</option>
                      {payMonthLabels.map((label, i) => (
                        <option key={i} value={String(i)}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Base salary (read-only) */}
                {payTarget && (
                  <div className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">الراتب الأساسي</span>
                    <span className="font-bold">{formatAmount(Number(payTarget.baseSalary))}</span>
                  </div>
                )}
                {/* Bonus + Deduction */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">مكافأة / بدل (+)</label>
                    <div className="relative">
                      <Input
                        type="text" inputMode="numeric"
                        placeholder="٠"
                        value={payForm.bonus === "0" ? "" : toAr(payForm.bonus)}
                        onChange={(e) => {
                          const raw = fromAr(e.target.value).replace(/^0+(\d)/, "$1");
                          setPayForm((f) => ({ ...f, bonus: raw || "0" }));
                        }}
                        className="h-10 pe-10"
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none pointer-events-none">ر.س</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">خصومات (-)</label>
                    <div className="relative">
                      <Input
                        type="text" inputMode="numeric"
                        placeholder="٠"
                        value={payForm.deduction === "0" ? "" : toAr(payForm.deduction)}
                        onChange={(e) => {
                          const raw = fromAr(e.target.value).replace(/^0+(\d)/, "$1");
                          setPayForm((f) => ({ ...f, deduction: raw || "0" }));
                        }}
                        className="h-10 pe-10"
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none pointer-events-none">ر.س</span>
                    </div>
                  </div>
                </div>
                {/* Conditional reason fields — appear only when relevant amount > 0 */}
                {(parseFloat(payForm.bonus) || 0) > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">سبب المكافأة / البدل (اختياري)</label>
                    <Input placeholder="مثال: مكافأة أداء، حضور متميز..." value={payForm.bonusNotes} onChange={(e) => setPayForm((f) => ({ ...f, bonusNotes: e.target.value }))} className="h-10" />
                  </div>
                )}
                {(parseFloat(payForm.deduction) || 0) > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">سبب الخصم (اختياري)</label>
                    <Input placeholder="مثال: غياب، تأخر، سلفة..." value={payForm.deductionNotes} onChange={(e) => setPayForm((f) => ({ ...f, deductionNotes: e.target.value }))} className="h-10" />
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">ملاحظات عامة (اختياري)</label>
                  <Input placeholder="مثال: دوام نصف شهر، تسوية مالية..." value={payForm.generalNotes} onChange={(e) => setPayForm((f) => ({ ...f, generalNotes: e.target.value }))} className="h-10" />
                </div>
                {/* Payment method */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">طريقة الصرف</label>
                  <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm((f) => ({ ...f, paymentMethod: v as "cash" | "bank", iban: v === "cash" ? "" : f.iban }))}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">كاش (نقداً)</SelectItem>
                      <SelectItem value="bank">تحويل بنكي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {payForm.paymentMethod === "bank" && (
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">رقم حساب الموظف / الآيبان IBAN</label>
                    <Input
                      placeholder="SA00 0000 0000 0000 0000 0000"
                      value={payForm.iban}
                      onChange={(e) => setPayForm((f) => ({ ...f, iban: e.target.value }))}
                      className="h-10 tracking-wide"
                      dir="ltr"
                    />
                  </div>
                )}
                {/* Net preview */}
                {payTarget && (
                  <div className="bg-muted/50 rounded-xl p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>الأساسي</span><span>{fmtSAR(Number(payTarget.baseSalary))}</span>
                    </div>
                    {(parseFloat(payForm.bonus)||0) > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>مكافأة</span><span>+ {fmtSAR(parseFloat(payForm.bonus)||0)}</span>
                      </div>
                    )}
                    {(parseFloat(payForm.deduction)||0) > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>خصم</span><span>- {fmtSAR(parseFloat(payForm.deduction)||0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-foreground border-t border-border pt-2">
                      <span>صافي الراتب</span>
                      <span className={payNet >= 0 ? "text-green-600" : "text-destructive"}>{fmtSAR(payNet)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="shrink-0 px-6 pb-6 pt-4 border-t">
                <Button
                  className="w-full h-11 font-bold"
                  disabled={paySalary.isPending || isReadOnly || !payForm.month}
                  onClick={() => {
                    if (isReadOnly) { onBlockedEdit(); return; }
                    if (!payTarget) return;
                    paySalary.mutate({
                      staffId: payTarget.id,
                      month: payForm.month,
                      bonus: parseFloat(payForm.bonus) || 0,
                      deduction: parseFloat(payForm.deduction) || 0,
                      notes: payForm.generalNotes || undefined,
                      bonusNotes: payForm.bonusNotes || undefined,
                      deductionNotes: payForm.deductionNotes || undefined,
                    });
                  }}
                >
                  {paySalary.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle className="w-4 h-4 me-2" />}
                  تأكيد صرف الراتب
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Print Preview Dialog ── */}
      <Dialog open={!!previewHtml} onOpenChange={(open) => { if (!open) setPreviewHtml(null); }}>
        <DialogContent hideClose className="max-w-4xl w-full max-h-[95vh] flex flex-col p-0 gap-0" dir="rtl">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/40 shrink-0 rounded-t-lg">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => { setPreviewHtml(null); setBulkReportOpen(true); }}
            >
              <ArrowRight className="w-3.5 h-3.5" />
              رجوع
            </Button>
            <h2 className="text-sm font-semibold flex-1 flex items-center gap-2 text-foreground">
              <Receipt className="w-4 h-4 text-primary shrink-0" />
              {previewTitle}
            </h2>
            {!previewEmpty && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => {
                    const iframe = document.getElementById("salary-preview-iframe") as HTMLIFrameElement;
                    iframe?.contentWindow?.print();
                  }}
                >
                  <Printer className="w-3.5 h-3.5" />
                  طباعة
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => {
                    const iframe = document.getElementById("salary-preview-iframe") as HTMLIFrameElement;
                    iframe?.contentWindow?.print();
                  }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  حفظ كـ PDF
                </Button>
              </>
            )}
            <button
              type="button"
              className="ms-1 rounded-sm p-1 opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="إغلاق"
              onClick={() => { setPreviewHtml(null); setBulkReportOpen(false); }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <iframe
            id="salary-preview-iframe"
            srcDoc={previewHtml ?? ""}
            className="flex-1 w-full border-0 rounded-b-lg"
            style={{ minHeight: "600px" }}
            title="معاينة إشعار صرف الراتب"
          />
        </DialogContent>
      </Dialog>

      {/* ── Bulk Payroll Report Modal ── */}
      <Dialog open={bulkReportOpen} onOpenChange={setBulkReportOpen}>
        <DialogContent className="max-w-sm w-full" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-primary" />
              إصدار كشف الرواتب الجماعي
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Year */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">السنة</label>
              <Select
                value={bulkReportYear !== null ? String(bulkReportYear) : ""}
                onValueChange={(v) => { setBulkReportYear(Number(v)); setBulkReportMonth(null); setBulkReportError(null); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر السنة" />
                </SelectTrigger>
                <SelectContent>
                  {bulkYearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {toArN(y)} {staffCalMode === "hijri" ? "هـ" : "م"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Month */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">الشهر</label>
              <Select
                value={bulkReportMonth !== null ? String(bulkReportMonth) : ""}
                onValueChange={(v) => { setBulkReportMonth(Number(v)); setBulkReportError(null); }}
                disabled={bulkReportYear === null}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الشهر" />
                </SelectTrigger>
                <SelectContent>
                  {bulkMonthOptions.map((month) => (
                    <SelectItem key={month} value={String(month)}>{(staffCalMode === "hijri" ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS_AR)[month - 1]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!histLoading && bulkPeriods.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground text-center">لا توجد رواتب مصروفة لإصدار كشف جماعي.</p>
          )}
          {bulkReportError && (
            <p className="text-sm text-destructive font-medium text-center pt-1">{bulkReportError}</p>
          )}
          <div className="pt-2">
            <Button
              className="w-full h-11 font-bold gap-2"
              disabled={histLoading || !bulkPeriodAvailable}
              onClick={() => {
                if (!bulkReportYear || !bulkReportMonth || !bulkPeriodAvailable) return;
                setBulkReportError(null);
                const ownerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل";
                let filterMonth = "";
                let hijriFilter: { year: number; month: number } | undefined;
                if (staffCalMode === "hijri") {
                  hijriFilter = { year: bulkReportYear, month: bulkReportMonth };
                  const approxGreg = Math.round(bulkReportYear * 0.9702 + 621.57);
                  outer: for (let y = approxGreg - 1; y <= approxGreg + 2; y++) {
                    for (let m = 1; m <= 12; m++) {
                      const h = toHijriComponents(new Date(y, m - 1, 15));
                      if (h.year === bulkReportYear && h.month === bulkReportMonth) {
                        filterMonth = `${y}-${String(m).padStart(2, "0")}`;
                        break outer;
                      }
                    }
                  }
                } else {
                  filterMonth = `${bulkReportYear}-${String(bulkReportMonth).padStart(2, "0")}`;
                }
                const hasRecords = paidHistory.some(l => {
                  if (hijriFilter) {
                    const d = new Date((l.month ?? "") + "-15");
                    if (isNaN(d.getTime())) return false;
                    const h = toHijriComponents(d);
                    return h.year === hijriFilter.year && h.month === hijriFilter.month;
                  }
                  return l.month === filterMonth;
                });
                if (!hasRecords) {
                  setBulkReportError("لا توجد رواتب مسجلة للفترة المحددة");
                  return;
                }
                const html = buildMasterPayrollHtml(filterMonth, paidHistory, ownerName, staffCalMode, hijriFilter);
                setPreviewTitle("معاينة كشف الرواتب الجماعي");
                setPreviewEmpty(false);
                setPreviewHtml(html);
                setBulkReportOpen(false);
              }}
            >
              <Receipt className="w-4 h-4" />
              معاينة وطباعة الكشف
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog removed — editing is now inline inside the slide-over panel */}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirmTarget(null)} />
          <div className="relative bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">حذف الموظف</h3>
                <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف <span className="font-semibold text-foreground">{deleteConfirmTarget.name}</span>؟</p>
              </div>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              سيتم حذف الموظف نهائياً من النظام. تبقى سجلات الرواتب السابقة محفوظة.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1 h-10 font-bold"
                disabled={deleteStaff.isPending}
                onClick={() => { deleteStaff.mutate(deleteConfirmTarget.id); setDeleteConfirmTarget(null); }}
              >
                <Trash2 className="w-4 h-4 me-1.5" />
                حذف نهائياً
              </Button>
              <Button variant="outline" className="h-10 px-5" onClick={() => setDeleteConfirmTarget(null)}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Employee Profile Modal ── */}
      <Dialog
        open={staffProfileTarget !== null}
        onOpenChange={(o) => { if (!o) { setStaffProfileTarget(null); setStaffProfileEditing(false); setEditId(null); } }}
      >
        <DialogContent className={`${staffProfileTab === "holdings" ? "max-w-5xl" : "max-w-2xl"} p-0 overflow-hidden gap-0 flex flex-col max-h-[88dvh]`} dir="rtl">
          {staffProfileTarget && (() => {
            const emp = staffProfileTarget;
            const empHistory = history.filter((l: SalaryLog) => l.staffId === emp.id);
            const empPerms = ALL_PERM_KEYS.filter((k) => emp.permissions?.[k]);
            const closeModal = () => { setStaffProfileTarget(null); setStaffProfileEditing(false); setEditId(null); };
            const startEdit = () => {
              const target = staffProfileTarget;
              if (!target?.id) return;
              setStaffProfileEditing(true);
              setEditId(target.id);
              setEditForm({
                name: target.name, baseSalary: target.baseSalary,
                assignedToType: target.assignedToType ?? "all",
                assignedToId: String(target.assignedToId ?? ""),
                username: target.username ?? "", password: "",
                nationalId: fromAr(target.nationalId ?? ""),
                phoneNum: employeeMobileInput(target.phoneNum ?? ""),
                birthDate: target.birthDate ?? "",
                hireDate: target.hireDate ?? "",
                isActive: target.isActive !== false,
              });
              setEditPerms({ ...(target.permissions ?? {}) });
            };
            const saveEdit = () => {
              const target = staffProfileTarget;
              if (!target?.id || !editForm.name.trim()) return;
              if (!validEmployeeMobile(editForm.phoneNum)) {
                toast({ title: "رقم الجوال غير مكتمل", description: "أدخل ١٠ أرقام تبدأ بـ ٠٥.", variant: "destructive" });
                return;
              }
              if (!validEmployeeNationalId(editForm.nationalId)) {
                toast({ title: "رقم الهوية / الإقامة غير مكتمل", description: "أدخل ١٠ أرقام بالضبط أو اترك الحقل الاختياري فارغًا.", variant: "destructive" });
                return;
              }
              const hasAnyPerm = Object.values(editPerms).some(Boolean);
              if (hasAnyPerm && !editForm.username.trim()) {
                toast({ title: "اسم المستخدم مطلوب", description: "يجب إدخال اسم مستخدم عند تفعيل أي صلاحية", variant: "destructive" });
                return;
              }
              editStaff.mutate({
                id: target.id,
                data: {
                  name: editForm.name.trim(),
                  baseSalary: parseFloat(editForm.baseSalary) || 0,
                  assignedToType: editForm.assignedToType,
                  assignedToId: editForm.assignedToType !== "all" && editForm.assignedToId ? Number(editForm.assignedToId) : null,
                  username: editForm.username.trim() || undefined,
                  password: editForm.password.trim() || undefined,
                  permissions: editPerms,
                  isActive: editForm.isActive,
                  nationalId: editForm.nationalId.trim(),
                  phoneNum: editForm.phoneNum,
                  birthDate: editForm.birthDate.trim() || undefined,
                  hireDate: editForm.hireDate.trim() || undefined,
                },
              });
            };

            return (
              <>
                {/* ── Modal Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-foreground">{emp.name}</p>
                      {emp.username
                        ? <p className="text-xs text-muted-foreground">@{emp.username}</p>
                        : <p className="text-xs text-amber-600">بدون حساب دخول</p>
                      }
                    </div>
                  </div>
                  {/* Quick stats inline */}
                  <div className="hidden sm:flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-muted-foreground">الراتب</p>
                      <p className="text-xs font-bold text-foreground">{formatAmount(Number(emp.baseSalary))}</p>
                    </div>
                    <div className="h-6 w-px bg-border/60" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">الحالة</p>
                      <p className="text-xs font-bold" style={{ color: emp.isActive !== false ? "#16a34a" : "#dc2626" }}>
                        {emp.isActive !== false ? "نشط" : "معطّل"}
                      </p>
                    </div>
                    <div className="h-6 w-px bg-border/60" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">الصلاحيات</p>
                      <p className="text-xs font-bold text-foreground">{empPerms.length === 0 ? "لا توجد" : `${empPerms.length}`}</p>
                    </div>
                  </div>
                </div>

                {/* ── Tabs ── */}
                <div className="flex flex-wrap border-b border-border shrink-0">
                  {(["profile", "finance", "holdings", "permissions"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setStaffProfileTab(tab)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-all border-b-2 ${
                        staffProfileTab === tab
                          ? "border-primary text-primary bg-primary/5"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      }`}
                    >
                      {tab === "profile" ? "الملف الشخصي" : tab === "finance" ? "السجل المالي" : tab === "holdings" ? "العهد والودائع" : "صلاحية المنصة"}
                    </button>
                  ))}
                </div>

                {/* ── Tab Content (scrollable) ── */}
                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${staffProfileTab === "holdings" ? "scrollbar-hide" : ""}`}>
                  {staffProfileTab === "holdings" && (
                    <StaffHoldingsPanel key={emp.id} staffId={emp.id} staffName={emp.name} readOnly={isReadOnly} apiFetch={apiFetch} />
                  )}
                  {staffProfileTab === "permissions" && (
                    <div className="p-5 space-y-4">
                      <h3 className="text-sm font-bold text-foreground">صلاحية المنصة — {emp.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {hasStaffPlatformAccess(emp)
                          ? "دخول المنصة مفعّل لهذا الموظف وفق الصلاحيات التالية."
                          : "دخول المنصة غير مفعّل لهذا الموظف؛ عرض الصلاحيات المحفوظة لا يمنحه صلاحية الدخول."}
                      </p>
                      <div className="space-y-2">
                        {empPerms.length === 0 && (
                          <p className="text-sm text-muted-foreground rounded-xl border border-border p-3">لا توجد صلاحيات ممنوحة لهذا الموظف.</p>
                        )}
                        {empPerms.map(key => (
                          <div key={key} className="rounded-xl border border-border p-3 flex items-start gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-foreground">{PERM_LABELS[key].label}</p>
                              <p className="text-xs text-muted-foreground mt-1">{PERM_LABELS[key].description}</p>
                            </div>
                            <span className="rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                              ممنوحة
                            </span>
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" disabled={isReadOnly} onClick={() => { setStaffProfileTab("profile"); startEdit(); }}>
                        تعديل بيانات الموظف وصلاحياته
                      </Button>
                    </div>
                  )}

                  {/* ─ Tab 1: الملف الشخصي ─ */}
                  {staffProfileTab === "profile" && (
                    <div className="p-6 space-y-4 text-right">

                      {/* Action buttons row */}
                      {!staffProfileEditing && (
                        <div className="flex gap-2">
                          <Button className="flex-1 h-9 font-bold" onClick={startEdit}>
                            <Edit2 className="w-3.5 h-3.5 me-1.5" />
                            تعديل البيانات
                          </Button>
                          <Button
                            variant="destructive"
                            className="h-9 px-5 font-bold"
                            onClick={() => { closeModal(); setDeleteConfirmTarget({ id: emp.id, name: emp.name }); }}
                          >
                            <Trash2 className="w-3.5 h-3.5 me-1" />
                            حذف الموظف
                          </Button>
                        </div>
                      )}

                      {/* ── View mode ── */}
                      {!staffProfileEditing && (
                        <div className="space-y-4">
                          {/* Basic data grid */}
                          <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">البيانات الأساسية</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">الاسم الكامل</p>
                                <p className="text-sm font-semibold text-foreground">{emp.name}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">الراتب الأساسي</p>
                                <p className="text-sm font-semibold text-foreground">{formatAmount(Number(emp.baseSalary))}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">الحالة الوظيفية</p>
                                <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full ${emp.isActive !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                  {emp.isActive !== false ? "نشط" : "غير نشط"}
                                </span>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">رقم الهوية / الإقامة</p>
                                <p className="text-sm text-foreground">{emp.nationalId || "—"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">رقم الجوال</p>
                                <p className="text-sm text-foreground" dir="ltr">{emp.phoneNum || "—"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">اسم المستخدم</p>
                                <p className="text-sm font-mono text-foreground">{emp.username ?? "—"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">الوحدة المكلّفة</p>
                                <p className="text-sm text-foreground">
                                  {emp.assignedToName ?? (emp.assignedToType === "all" ? "جميع الوحدات" : emp.assignedToType === "chalet" ? "عقار" : "خدمة")}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">تاريخ الميلاد</p>
                                <p className="text-sm text-foreground">{emp.birthDate || "—"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">تاريخ التعيين</p>
                                <p className="text-sm text-foreground">{emp.hireDate || "—"}</p>
                              </div>
                            </div>
                          </div>

                          {/* Permissions */}
                          <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">الصلاحيات الممنوحة</p>
                            {empPerms.length === 0 ? (
                              <p className="text-sm text-muted-foreground italic">لا توجد صلاحيات مفعّلة</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {empPerms.map((k) => (
                                  <span key={k} className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary rounded-full px-3 py-1 font-medium">
                                    {PERM_LABELS[k].icon} {PERM_LABELS[k].label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                        </div>
                      )}

                      {/* ── Edit mode (inline) ── */}
                      {staffProfileEditing && (
                        <div className="space-y-4">
                          <p className="text-sm font-bold text-primary flex items-center gap-1.5"><Edit2 className="w-4 h-4" /> وضع التعديل</p>

                          {/* Name + Salary */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground font-medium mb-1 block">الاسم الكامل *</label>
                              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="h-10" />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground font-medium mb-1 block">الراتب الأساسي (ر.س)</label>
                              <Input type="text" inputMode="numeric" value={toAr(editForm.baseSalary)} onChange={(e) => setEditForm((f) => ({ ...f, baseSalary: fromAr(e.target.value) }))} className="h-10" />
                            </div>
                          </div>

                          {/* Unit */}
                          {(staffChalets.length > 0 || staffProviders.length > 0) && (
                            <div className="rounded-xl border border-border/60 p-3 bg-muted/10">
                              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> الوحدة المكلّفة</p>
                              <div className="flex gap-2 flex-wrap">
                                <Select value={editForm.assignedToType} onValueChange={(v) => setEditForm((f) => ({ ...f, assignedToType: v as any, assignedToId: "" }))}>
                                  <SelectTrigger className="h-9 flex-1 min-w-[120px] text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">جميع الوحدات</SelectItem>
                                    {staffChalets.length > 0 && <SelectItem value="chalet">وحدة محددة</SelectItem>}
                                    {staffProviders.length > 0 && <SelectItem value="service">خدمة محددة</SelectItem>}
                                  </SelectContent>
                                </Select>
                                {editForm.assignedToType === "chalet" && (
                                  <Select value={editForm.assignedToId} onValueChange={(v) => setEditForm((f) => ({ ...f, assignedToId: v }))}>
                                    <SelectTrigger className="h-9 flex-1 min-w-[140px] text-sm"><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                                    <SelectContent>{staffChalets.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nameAr ?? `وحدة #${c.id}`}</SelectItem>)}</SelectContent>
                                  </Select>
                                )}
                                {editForm.assignedToType === "service" && (
                                  <Select value={editForm.assignedToId} onValueChange={(v) => setEditForm((f) => ({ ...f, assignedToId: v }))}>
                                    <SelectTrigger className="h-9 flex-1 min-w-[140px] text-sm"><SelectValue placeholder="اختر الخدمة" /></SelectTrigger>
                                    <SelectContent>{staffProviders.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.businessName}</SelectItem>)}</SelectContent>
                                  </Select>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Credentials */}
                          <div className="rounded-xl border border-border/60 p-3 bg-muted/10">
                            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> بيانات الدخول</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">اسم المستخدم</label>
                                <Input value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} className="h-9 text-sm" dir="ltr" placeholder="username" />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">كلمة مرور جديدة</label>
                                <Input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} className="h-9 text-sm" dir="ltr" placeholder="فارغة = بدون تغيير" />
                              </div>
                            </div>
                          </div>

                          {/* Personal Info */}
                          <div className="rounded-xl border border-border/60 p-3 bg-muted/10">
                            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> البيانات الشخصية</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">رقم الهوية / الإقامة</label>
                                <Input value={toAr(editForm.nationalId)} onChange={(e) => setEditForm((f) => ({ ...f, nationalId: employeeDigits(e.target.value) }))} className="h-9 text-sm" placeholder="١٠ أرقام" type="text" inputMode="numeric" minLength={10} pattern="[٠-٩]{10}" title="رقم الهوية / الإقامة يتكون من ١٠ أرقام بالضبط" dir="ltr" />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">رقم الجوال</label>
                                <Input value={toAr(editForm.phoneNum)} onChange={(e) => setEditForm((f) => ({ ...f, phoneNum: employeeMobileInput(e.target.value) }))} className="h-9 text-sm" placeholder="٠٥٠٠٠٠٠٠٠٠" type="text" inputMode="numeric" minLength={10} pattern="٠٥[٠-٩]{8}" title="أدخل ١٠ أرقام تبدأ بـ ٠٥" autoComplete="tel-national" required dir="ltr" />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">تاريخ الميلاد</label>
                                <EmployeeDatePicker
                                  kind="birth"
                                  value={editForm.birthDate}
                                  onChange={(value) => setEditForm((f) => ({ ...f, birthDate: value }))}
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">تاريخ التعيين</label>
                                <EmployeeDatePicker
                                  kind="hire"
                                  value={editForm.hireDate}
                                  onChange={(value) => setEditForm((f) => ({ ...f, hireDate: value }))}
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Active Status */}
                          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <UserCheck className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs font-semibold text-muted-foreground">حالة الموظف</span>
                            </div>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <Switch checked={editForm.isActive} onCheckedChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))} />
                              <span className={`text-sm font-semibold ${editForm.isActive ? "text-green-600" : "text-muted-foreground"}`}>
                                {editForm.isActive ? "نشط" : "غير نشط"}
                              </span>
                            </label>
                          </div>

                          {/* Permissions */}
                          <div className="rounded-xl border border-border/60 p-3 bg-muted/10">
                            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> الصلاحيات</p>
                            <div className="grid grid-cols-2 gap-2">
                              {ALL_PERM_KEYS.map((key) => {
                                const info = PERM_LABELS[key];
                                return (
                                  <label key={key} className="flex items-center gap-2.5 cursor-pointer py-1">
                                    <Switch checked={!!editPerms[key]} onCheckedChange={(v) => setEditPerms((p) => ({ ...p, [key]: v }))} className="shrink-0" />
                                    <span className="text-sm text-foreground">{info.icon} {info.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <Button
                              className="flex-1 h-11 font-bold text-sm"
                              disabled={editStaff.isPending || !editForm.name.trim()}
                              onClick={saveEdit}
                            >
                              {editStaff.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Check className="w-4 h-4 me-1.5" />}
                              حفظ جميع التعديلات
                            </Button>
                            <Button
                              variant="outline"
                              className="h-11 px-5 font-semibold text-sm"
                              onClick={() => { setStaffProfileEditing(false); setEditId(null); }}
                              disabled={editStaff.isPending}
                            >
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─ Tab 2: السجل المالي ─ */}
                  {staffProfileTab === "finance" && (
                    <div className="p-6 text-right">
                      <p className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-primary" />
                        كشف حساب الرواتب — {emp.name}
                      </p>
                      {empHistory.length === 0 ? (
                        <div className="text-center py-12">
                          <Receipt className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">لا توجد معاملات مالية مسجّلة لهذا الموظف</p>
                        </div>
                      ) : (
                        <div className="rounded-xl overflow-hidden border border-border/40">
                          <table className="w-full text-xs border-collapse" dir="rtl">
                            <thead>
                              <tr className="bg-muted/60 border-b border-border/40">
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">الشهر</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">الأساسي</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">مكافأة</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">خصم</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">الصافي</th>
                                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">تاريخ الصرف</th>
                              </tr>
                            </thead>
                            <tbody>
                              {empHistory.map((log: SalaryLog, i: number) => {
                                const base = Number((log as any).baseSalary ?? emp.baseSalary ?? 0);
                                const bonus = Number(log.bonus);
                                const deduction = Number(log.deduction);
                                const net = base + bonus - deduction;
                                const paidDate = log.paidAt ? (() => {
                                  const d = new Date(log.paidAt!);
                                  const h = toHijriComponents(d);
                                  const greg = d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
                                  return `${toArN(h.day)} ${HIJRI_MONTHS_AR[h.month - 1]} ${toArN(h.year)} هـ — ${greg} م`;
                                })() : "—";
                                return (
                                  <tr key={log.id} className={`border-b border-border/20 last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                                    <td className="px-4 py-3 font-semibold text-foreground">{salaryMonthLabel(log.month)}</td>
                                    <td className="px-4 py-3 text-foreground">{fmtSAR(base)}</td>
                                    <td className="px-4 py-3 text-green-600">{bonus > 0 ? `+${fmtSAR(bonus)}` : "—"}</td>
                                    <td className="px-4 py-3 text-destructive">{deduction > 0 ? `-${fmtSAR(deduction)}` : "—"}</td>
                                    <td className="px-4 py-3 font-bold text-foreground">{fmtSAR(net)}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{paidDate}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-muted/40 border-t border-border">
                                <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-muted-foreground">إجمالي ما صُرف</td>
                                <td colSpan={2} className="px-4 py-2.5 font-bold text-primary text-sm">
                                  {fmtSAR(empHistory.reduce((acc: number, l: SalaryLog) => {
                                    const b = Number((l as any).baseSalary ?? emp.baseSalary ?? 0);
                                    return acc + b + Number(l.bonus) - Number(l.deduction);
                                  }, 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
