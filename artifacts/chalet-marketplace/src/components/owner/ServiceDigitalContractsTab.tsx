import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo, useRef } from "react";
import { clampPage, filterServiceContracts, paginate, serviceContractStatus, serviceMonthOptions, serviceYearOptions, SERVICE_CONTRACTS_PAGE_SIZE, type ServiceCalView, type ServiceContractStatus } from "@/lib/serviceContractArchive";
import { publicContractUrl, contractWhatsAppActionText, CONTRACT_STATUS_STYLES } from "@/lib/digitalContracts";
import { formatDualDate, withHijriEra, HIJRI_MONTHS_AR } from "@/lib/hijri";
import { ChevronDown, Camera, Loader2, FileText, Settings, Search, Eye, X, RefreshCw, Send, Save, ScrollText, Printer, Paperclip } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toAr } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useReadOnly, useServiceErp } from "@/components/owner/OwnerDashboardContexts";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { uploadFile } from "@/components/owner/finance-shared";
import { encodeWhatsAppText } from "@/components/owner/owner-message-templates";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { serviceDurationLabel, toArN } from "@/components/owner/owner-formatting";
import { GREGORIAN_MONTHS_AR, getCalCorrespondenceHint } from "@/components/owner/owner-calendar";
import { ServiceContractPreviewDialog } from "@/components/owner/ServiceContractPreviewDialog";


/* ── Service Digital Contracts Tab ─────────────────────────── */
export function ServiceDigitalContractsTab() {
  const { providerId } = useServiceErp();
  /* Keyed per provider so settings drafts, filters and pages never leak across services. */
  return <ServiceDigitalContractsTabInner key={providerId ?? "none"} />;
}

function ServiceDigitalContractsTabInner() {
  const { providerId } = useServiceErp();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [contractText, setContractText] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewBooking, setPreviewBooking] = useState<any | null>(null);
  const [showSettingsPreview, setShowSettingsPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [calView, setCalView] = useState<ServiceCalView>(
    () => (localStorage.getItem("dashCalDefaultType") === "gregorian" ? "gregorian" : "hijri"),
  );
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("all");
  const [status, setStatus] = useState<"all" | ServiceContractStatus>("all");
  const [page, setPage] = useState(1);
  const [dropdownPos, setDropdownPos] = useState<{ id: number; right: number; top: number; up: boolean } | null>(null);
  const initializedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!dropdownPos) return;
    const close = () => setDropdownPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [dropdownPos]);

  const providerQ = useQuery<any>({
    queryKey: ["service-provider-detail", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/${providerId}`);
      if (!r.ok) throw new Error("provider");
      return r.json();
    },
    enabled: !!providerId,
  });
  const provider = providerQ.data;
  const appointmentsQ = useQuery<any[]>({
    queryKey: ["service-appointments", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments`);
      if (!r.ok) throw new Error("appointments");
      return r.json();
    },
    enabled: !!providerId,
  });
  const appointments = useMemo<any[]>(
    () => (Array.isArray(appointmentsQ.data) ? appointmentsQ.data : []),
    [appointmentsQ.data],
  );

  /* Initialise drafts once per provider; refetches never overwrite unsaved wording. */
  useEffect(() => {
    if (!provider || initializedFor.current === providerId) return;
    initializedFor.current = providerId ?? null;
    setLogoUrl(provider.logoUrl ?? "");
    setContractText(provider.contractText ?? "");
    setIncludeSignature(provider.includeElectronicSignature !== false);
  }, [provider, providerId]);

  const yearOptions = useMemo(() => serviceYearOptions(appointments, calView), [appointments, calView]);
  const monthOptions = useMemo(() => serviceMonthOptions(appointments, calView, year), [appointments, calView, year]);
  const displayed = useMemo(
    () => filterServiceContracts(appointments, { search, cal: calView, year, month, status }),
    [appointments, search, calView, year, month, status],
  );
  const totalPages = Math.max(1, Math.ceil(displayed.length / SERVICE_CONTRACTS_PAGE_SIZE));
  const safePage = clampPage(page, displayed.length);
  const paginated = useMemo(() => paginate(displayed, safePage), [displayed, safePage]);

  useEffect(() => { setPage(1); }, [search, calView, year, month, status]);
  useEffect(() => { setPage(p => clampPage(p, displayed.length)); }, [displayed.length]);

  const stats = useMemo(() => {
    let signed = 0, pending = 0, cancelled = 0;
    for (const a of appointments) {
      const k = serviceContractStatus(a);
      if (k === "signed") signed++; else if (k === "cancelled") cancelled++; else pending++;
    }
    return { signed, pending, cancelled };
  }, [appointments]);

  function serviceContractUrl(id: number) {
    return publicContractUrl(id, "service", BASE);
  }

  function serviceDeliveryMethodLabel(value: string | null | undefined) {
    if (value === "delivery_installation") return "توصيل وتركيب بموقع العميل";
    if (value === "customer_pickup") return "استلام العميل من المقر";
    return "—";
  }

  async function saveSettings() {
    if (isReadOnly) return onBlockedEdit();
    setSaving(true);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          logoUrl: logoUrl.trim() || null,
          contractText: contractText.trim() || null,
          includeElectronicSignature: includeSignature,
        }),
      });
      if (!r.ok) throw new Error();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["service-provider-detail", providerId] }),
        qc.invalidateQueries({ queryKey: ["my-approved-providers"] }),
      ]);
      toast({ title: "تم الحفظ ✓", description: "تم تحديث إعدادات عقد الخدمة" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر حفظ إعدادات العقد", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function uploadLogo(file: File) {
    if (isReadOnly) return onBlockedEdit();
    setUploading(true);
    try {
      const url = await uploadFile(file);
      if (url) setLogoUrl(url);
      else toast({ title: "خطأ", description: "تعذّر رفع الشعار", variant: "destructive" });
    } finally { setUploading(false); }
  }

  async function copyContractLink(a: any) {
    await navigator.clipboard.writeText(serviceContractUrl(a.id));
    toast({ title: "تم النسخ ✓", description: "رابط العقد في الحافظة" });
  }

  function sendWhatsApp(a: any) {
    const phone = String(a.clientPhone ?? "").replace(/\D/g, "").replace(/^0/, "966");
    const dual = formatDualDate(a.dateStr);
    const msg = encodeWhatsAppText(
      `مرحباً ${a.clientName ?? "بكم"}،\n\nبخصوص حجزكم لدى ${provider?.businessName ?? "مقدم الخدمة"} بتاريخ ${dual.gregorian} (${dual.hijri}).\n\n`
      + `${contractWhatsAppActionText(serviceContractStatus(a) === "signed", "يرجى مراجعة بيانات العقد والشروط والأحكام والتوقيع إلكترونياً عبر الرابط التالي:")}\n${serviceContractUrl(a.id)}\n\nشكراً لاختياركم.`,
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener,noreferrer");
  }

  function printContract(a: any) {
    window.open(`${window.location.origin}${BASE}/service-contract/${a.id}?print=1`, "_blank", "noopener,noreferrer");
  }

  const STATUS_LABEL: Record<ServiceContractStatus, string> = { signed: "موقّع", pending: "قيد الانتظار", cancelled: "ملغى" };

  if (providerQ.isLoading || appointmentsQ.isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-5" dir="rtl" data-testid="service-contracts-loading">
        <div className="h-48 rounded-2xl border border-border bg-muted/30 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl border border-border bg-muted/30 animate-pulse" />)}</div>
        <div className="h-64 rounded-2xl border border-border bg-muted/30 animate-pulse" />
      </div>
    );
  }

  if (providerQ.isError) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4" dir="rtl">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 flex flex-col items-center gap-3 text-center">
          <ScrollText className="w-10 h-10 text-destructive/50" />
          <p className="text-sm font-semibold text-foreground">تعذّر تحميل إعدادات عقد الخدمة</p>
          <button type="button" data-testid="button-retry-service-provider" onClick={() => providerQ.refetch()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <RefreshCw className="w-4 h-4" />إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const hasFilters = !!search || status !== "all" || month !== "all" || !!year;
  const actionCls = "w-full flex items-center gap-2.5 px-3 py-2 text-right text-sm hover:bg-muted/60 transition-colors text-foreground disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-5" dir="rtl">

      {/* ── Settings Panel ── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Settings className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">إعدادات عقد الخدمة</h3>
            <p className="text-xs text-muted-foreground">الشعار والشروط والتوقيع الإلكتروني الظاهرة في العقد</p>
          </div>
        </div>

        {/* Logo upload */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">شعار العقد <span className="font-normal">(اختياري)</span></label>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="input-service-contract-logo"
            disabled={saving || uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
          />
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <div className="relative shrink-0">
                <img src={logoUrl} alt="شعار العقد" className="w-16 h-16 rounded-xl object-contain border border-border bg-muted/30 p-1" data-testid="img-service-contract-logo" />
                <button
                  type="button"
                  onClick={() => { if (isReadOnly) return onBlockedEdit(); setLogoUrl(""); }}
                  title="إزالة الشعار"
                  data-testid="button-remove-service-logo"
                  disabled={saving || uploading}
                  className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs leading-none hover:bg-destructive/80 transition-colors"
                >
                  ×
                </button>
              </div>
            ) : null}
            <button
              type="button"
              disabled={saving || uploading}
              data-testid="button-upload-service-logo"
              onClick={() => { if (isReadOnly) return onBlockedEdit(); logoInputRef.current?.click(); }}
              className={`flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 transition-colors text-sm font-medium ${
                uploading
                  ? "border-primary/30 bg-primary/5 text-primary cursor-not-allowed"
                  : "border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary cursor-pointer"
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>جارٍ الرفع…</span>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  <span>{logoUrl ? "تغيير الشعار" : "رفع شعار العقد"}</span>
                  <span className="text-xs font-normal opacity-60">PNG · JPG · WEBP</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Terms */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">الشروط والأحكام</label>
          <Textarea
            value={contractText}
            onChange={e => setContractText(e.target.value)}
            rows={8}
            data-testid="input-service-contract-text"
            className="rounded-xl resize-y text-sm bg-background focus-visible:ring-primary/30"
            placeholder="اكتب شروط وأحكام تقديم الخدمة..."
          />
        </div>

        {/* Signature toggle */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-3">
          <div>
            <p className="text-sm font-semibold text-foreground">التوقيع الإلكتروني</p>
            <p className="text-xs text-muted-foreground mt-0.5">إظهار مساحة التوقيع الإلكتروني للعميل في العقد.</p>
          </div>
          <Switch checked={includeSignature} onCheckedChange={setIncludeSignature} data-testid="switch-service-signature" />
        </div>

        {/* Save + preview */}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            data-testid="button-preview-service-contract"
            disabled={uploading}
            onClick={() => setShowSettingsPreview(true)}
            className="flex items-center gap-2 px-5 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
          >
            <Eye className="w-4 h-4" />معاينة العقد
          </button>
          <button
            type="button"
            disabled={saving || uploading}
            data-testid="button-save-service-contract"
            onClick={saveSettings}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "جارٍ الحفظ…" : "حفظ إعدادات العقد"}
          </button>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ScrollText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-foreground">قائمة العقود الرقمية</h2>
            <SectionGuideButton sectionKey="digitalContracts" />
          </div>
          <p className="text-sm text-muted-foreground">سجل كامل بجميع عقود حجوزات الخدمة الموقَّعة والمعلَّقة</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { suffix: "موقّع", value: stats.signed, bg: CONTRACT_STATUS_STYLES.signed },
          { suffix: "قيد الانتظار", value: stats.pending, bg: CONTRACT_STATUS_STYLES.pending },
          { suffix: "ملغى", value: stats.cancelled, bg: CONTRACT_STATUS_STYLES.cancelled },
        ].map(({ suffix, value, bg }) => {
          const noun = value >= 3 && value <= 10 ? "عقود" : "عقد";
          return (
            <div key={suffix} className={`rounded-xl border px-4 py-3 text-center ${bg}`} data-testid={`stat-service-contracts-${suffix}`}>
              <p className="text-2xl font-bold">{toAr(value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{noun} {suffix}</p>
            </div>
          );
        })}
      </div>

      {/* ── Filter Bar ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
            {(["hijri", "gregorian"] as const).map(mode => (
              <button
                key={mode}
                type="button"
                data-testid={`button-service-cal-${mode}`}
                onClick={() => { setCalView(mode); setMonth("all"); setYear(""); }}
                className={`text-xs px-3 py-1.5 font-medium transition-colors ${calView === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >{mode === "hijri" ? "هجري" : "ميلادي"}</button>
            ))}
          </div>
          <Select value={year || "__all__"} onValueChange={yr => { setYear(yr === "__all__" ? "" : yr); setMonth("all"); }}>
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7rem] shrink-0" dir="rtl" data-testid="select-service-contract-year">
              {year
                ? <span className="text-sm font-medium">{calView === "hijri" ? `${toArN(Number(year))} هـ` : `${toArN(Number(year))} م`}</span>
                : <span className="text-sm text-muted-foreground">كل السنوات</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
              <SelectItem value="__all__"><span className="text-sm">كل السنوات</span></SelectItem>
              {yearOptions.map(yr => (
                <SelectItem key={yr} value={yr}>
                  {calView === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={!year ? "all" : month} onValueChange={v => { if (year) setMonth(v); }} disabled={!year}>
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[8rem] shrink-0" dir="rtl" data-testid="select-service-contract-month">
              {month !== "all" && year ? (() => {
                const ms = Number(month.split("-")[1]);
                return <span className="font-medium">{calView === "hijri" ? HIJRI_MONTHS_AR[ms - 1] : GREGORIAN_MONTHS_AR[ms - 1]}</span>;
              })() : <span className="text-muted-foreground">كل العقود</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end" className="z-[100]">
              <SelectItem value="all"><span className="text-sm">كل العقود</span></SelectItem>
              {monthOptions.map(key => {
                const [ys, ms] = key.split("-").map(Number);
                const primary = calView === "hijri" ? `${HIJRI_MONTHS_AR[ms - 1]} ${toArN(ys)} هـ` : `${GREGORIAN_MONTHS_AR[ms - 1]} ${toArN(ys)} م`;
                const corr = getCalCorrespondenceHint(key, calView);
                return (
                  <SelectItem key={key} value={key} textValue={primary}>
                    <div style={{ width: "100%", direction: "rtl" }}>
                      <div style={{ fontWeight: "600", fontSize: "13px", textAlign: "right" }}>{primary}</div>
                      {corr && <div style={{ fontSize: "11px", color: "#888", textAlign: "right", marginTop: "1px" }}>{corr}</div>}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="relative" dir="rtl">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-service-contract-search"
            placeholder="ابحث بالاسم أو رقم الحجز أو الجوال…"
            className="w-full rounded-xl border border-border bg-background pr-10 pl-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
          />
          {search && (
            <button type="button" data-testid="button-clear-service-search" onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "signed", "pending", "cancelled"] as const).map(s => (
            <button
              key={s}
              type="button"
              data-testid={`button-service-status-${s}`}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                status === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {{ all: "الكل", signed: "مكتمل / موقّع", pending: "بانتظار التوقيع", cancelled: "ملغاة" }[s]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contracts Table ── */}
      <div className="rounded-2xl border border-border overflow-hidden bg-card">
        {appointmentsQ.isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <ScrollText className="w-10 h-10 opacity-20" />
            <p className="text-sm">تعذّر تحميل عقود الخدمة</p>
            <button type="button" data-testid="button-retry-service-contracts" onClick={() => appointmentsQ.refetch()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-medium text-foreground hover:bg-muted/60 hover:border-primary/40 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />إعادة المحاولة
            </button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <ScrollText className="w-10 h-10 opacity-20" />
            <p className="text-sm">{hasFilters ? "لا توجد نتائج مطابقة" : "لا توجد عقود حتى الآن"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-right">
                  <th className="px-4 py-3 font-semibold text-muted-foreground w-16">رقم</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">اسم العميل</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">الجوال</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">حالة العقد</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">تاريخ الحجز</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((a: any, idx: number) => {
                  const key = serviceContractStatus(a);
                  const dualDt = a.dateStr ? formatDualDate(a.dateStr) : null;
                  const hijri = dualDt ? withHijriEra(dualDt.hijri) : "";
                  return (
                    <tr key={a.id} data-testid={`row-service-contract-${a.id}`} className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-primary">#{toAr(a.id)}</span></td>
                      <td className="px-4 py-3"><span className="font-medium text-foreground">{a.clientName || "—"}</span></td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {a.clientPhone
                          ? <span className="text-xs text-foreground" dir="ltr">{toArN(a.clientPhone)}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold border ${CONTRACT_STATUS_STYLES[key]}`}>{STATUS_LABEL[key]}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {dualDt && dualDt.gregorian ? (
                          <div className="text-xs">
                            {calView === "hijri" ? (
                              <><p className="text-foreground font-semibold">{hijri}</p><p className="text-muted-foreground">{dualDt.gregorian}</p></>
                            ) : (
                              <><p className="text-foreground font-semibold">{dualDt.gregorian} م</p><p className="text-muted-foreground">{hijri}</p></>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            data-testid={`button-service-contract-actions-${a.id}`}
                            onClick={e => {
                              if (dropdownPos?.id === a.id) { setDropdownPos(null); return; }
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const up = window.innerHeight - rect.bottom < 200;
                              setDropdownPos({ id: a.id, right: window.innerWidth - rect.right, top: up ? window.innerHeight - rect.top + 4 : rect.bottom + 4, up });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-medium text-foreground hover:bg-muted/60 hover:border-primary/40 transition-colors"
                          >
                            الإجراءات
                            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${dropdownPos?.id === a.id ? "rotate-180" : ""}`} />
                          </button>
                          {dropdownPos?.id === a.id && createPortal(
                            <>
                              <div className="fixed inset-0 z-[9998]" onClick={() => setDropdownPos(null)} />
                              <div className="fixed z-[9999] w-48 rounded-xl border border-border bg-card shadow-xl py-1" style={{ direction: "rtl", right: dropdownPos!.right, ...(dropdownPos!.up ? { bottom: dropdownPos!.top } : { top: dropdownPos!.top }) }}>
                                <button type="button" className={actionCls} onClick={() => { setPreviewBooking(a); setDropdownPos(null); }}><Eye className="w-4 h-4 text-muted-foreground" />عرض العقد</button>
                                <button type="button" className={actionCls} disabled={!a.clientPhone} onClick={() => { sendWhatsApp(a); setDropdownPos(null); }}><Send className="w-4 h-4 text-green-600" />إرسال عبر الواتساب</button>
                                <button type="button" className={actionCls} onClick={() => { printContract(a); setDropdownPos(null); }}><Printer className="w-4 h-4 text-muted-foreground" />طباعة العقد</button>
                                <button type="button" className={actionCls} onClick={() => { copyContractLink(a); setDropdownPos(null); }}><Paperclip className="w-4 h-4 text-muted-foreground" />نسخ رابط العقد</button>
                              </div>
                            </>,
                            document.body,
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!appointmentsQ.isError && displayed.length > 0 && (
          <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-2 flex-wrap" dir="rtl">
            <span className="text-xs text-muted-foreground" data-testid="text-service-contracts-count">
              {(() => {
                const from = (safePage - 1) * SERVICE_CONTRACTS_PAGE_SIZE + 1;
                const to = Math.min(safePage * SERVICE_CONTRACTS_PAGE_SIZE, displayed.length);
                const t = displayed.length;
                const noun = (n: number) => n >= 3 && n <= 10 ? "عقود" : "عقد";
                return t <= SERVICE_CONTRACTS_PAGE_SIZE ? `${toAr(t)} ${noun(t)}` : `عرض ${toAr(from)} - ${toAr(to)} من أصل ${toAr(t)} ${noun(t)}`;
              })()}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="h-7 px-2.5 rounded-lg border border-border text-xs font-semibold bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">السابق</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, n, i, arr) => {
                    if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, i) =>
                    n === "…"
                      ? <span key={`sep-${i}`} className="text-xs text-muted-foreground px-1">…</span>
                      : <button key={n} type="button" onClick={() => setPage(n as number)} className={`h-7 w-7 rounded-lg border text-xs font-semibold transition-colors ${safePage === n ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground hover:bg-muted"}`}>{toAr(n as number)}</button>,
                  )}
                <button type="button" disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="h-7 px-2.5 rounded-lg border border-border text-xs font-semibold bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">التالي</button>
              </div>
            )}
          </div>
        )}
      </div>
      <Dialog open={showSettingsPreview} onOpenChange={open => { if (!open) setShowSettingsPreview(false); }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>معاينة عقد الخدمة</DialogTitle><DialogDescription>معاينة شكل العقد قبل الإرسال أو الطباعة.</DialogDescription></DialogHeader>
          <div className="rounded-2xl border border-[#e3d9cf] overflow-hidden bg-white text-[#2a2018]">
            <div className="bg-[#8b5e2b] text-white text-center p-4"><p className="text-xl font-black">تكية</p><p className="text-xs mt-1">عقد تقديم خدمة رقمي</p></div>
            <div className="flex items-center gap-4 p-5 bg-[#fdf9f6] border-b border-[#e3d9cf]">
              {logoUrl ? <img src={logoUrl} alt="" className="w-16 h-16 rounded-xl object-contain border border-[#e3d9cf] bg-white p-1" /> : <div className="w-16 h-16 rounded-xl bg-[#8b5e2b]/10 flex items-center justify-center"><FileText className="w-7 h-7 text-[#8b5e2b]/60" /></div>}
              <div className="flex-1"><p className="font-bold text-lg">{provider?.businessName}</p><p className="text-xs text-[#75604a] mt-1">عقد خدمة رقم #{toArN(previewBooking?.id ?? "١٢٣")}</p></div>
            </div>
            <div className="grid grid-cols-2 border-b border-[#e3d9cf]"><div className="p-4"><p className="text-[10px] text-[#8b5e2b] font-bold">مقدم الخدمة</p><p className="font-semibold mt-1">{provider?.businessName}</p></div><div className="p-4 border-r border-[#e3d9cf]"><p className="text-[10px] text-emerald-700 font-bold">العميل</p><p className="font-semibold mt-1">{previewBooking?.clientName ?? "عميل نموذجي"}</p><p className="text-xs text-[#75604a]" dir="ltr">{previewBooking?.clientPhone ?? ""}</p></div></div>
            {previewBooking && <div className="grid grid-cols-2 gap-3 p-5 border-b border-[#e3d9cf] text-sm"><div><span className="text-[#75604a]">تاريخ الحجز: </span><b>{formatDualDate(previewBooking.dateStr).gregorian}</b></div><div><span className="text-[#75604a]">المدة: </span><b>{serviceDurationLabel(previewBooking.duration, previewBooking.durationUnit) ?? "—"}</b></div><div className="col-span-2"><span className="text-[#75604a]">طريقة تقديم الخدمة: </span><b>{serviceDeliveryMethodLabel(previewBooking.serviceDeliveryMethod)}</b></div><div className="col-span-2"><span className="text-[#75604a]">العنوان والموقع: </span><b>{previewBooking.serviceAddress || "—"}</b></div><div className="col-span-2"><span className="text-[#75604a]">التفاصيل والملاحظات: </span><b className="whitespace-pre-wrap">{previewBooking.notes || "—"}</b></div></div>}
            <div className="p-5"><p className="text-xs font-bold text-[#75604a] mb-3">الشروط والأحكام</p><div className="whitespace-pre-wrap leading-8 text-sm">{contractText.trim() || "لم تتم إضافة شروط وأحكام بعد."}</div></div>
            {includeSignature && <div className="m-5 mt-0 rounded-xl border border-[#e3d9cf] bg-[#fdf9f6] p-4 text-sm"><b>التوقيع الإلكتروني:</b> {previewBooking?.contractSigned ? "تم توقيع العقد إلكترونياً ✓" : "مساحة توقيع العميل تظهر في العقد المرسل"}</div>}
          </div>
        </DialogContent>
      </Dialog>
      <ServiceContractPreviewDialog appointment={previewBooking} onClose={() => setPreviewBooking(null)} />
    </div>
  );
}
