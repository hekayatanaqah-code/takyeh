import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo, useRef } from "react";
import { publicContractUrl, contractInvitationText, propertyContractClauses, contractTermsText, contractMoney, CONTRACT_STATUS_STYLES } from "@/lib/digitalContracts";
import { Plus, ChevronDown, Camera, Loader2, FileText, Settings, Search, Eye, Image as ImageIcon, X, Save, ScrollText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDualDate, HIJRI_MONTHS_AR } from "@/lib/hijri";
import { toAr } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { createPortal } from "react-dom";
import { apiFetch } from "@/components/owner/owner-api";
import { uploadFile } from "@/components/owner/finance-shared";
import { toArN } from "@/components/owner/owner-formatting";
import { encodeWhatsAppText } from "@/components/owner/owner-message-templates";
import { OwnerBooking } from "@/components/owner/owner-booking-types";
import { GREGORIAN_MONTHS_AR, getBookingMonthKey, getCalCorrespondenceHint } from "@/components/owner/owner-calendar";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


/* ── Contract Settings Tab ────────────────────────────────── */

interface ContractClause { id: string; text: string; enabled: boolean; isCustom?: boolean; }

export function ContractSettingsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: submissions = [], isLoading } = useQuery<any[]>({
    queryKey: ["contractSettings-submissions"],
    queryFn: async () => {
      const r = await apiFetch("/submissions");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [logoUrl, setLogoUrl]         = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [clauses, setClauses]         = useState<ContractClause[]>([]);
  const [saving, setSaving]           = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const selected = useMemo(
    () => submissions.find((s: any) => s.id === selectedId),
    [submissions, selectedId],
  );

  useEffect(() => {
    if (submissions.length > 0 && selectedId === null) setSelectedId(submissions[0].id);
  }, [submissions, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setLogoUrl(selected.logoUrl ?? "");
    setClauses(propertyContractClauses(selected.termsAndConditions));
  }, [selected]);

  const computedTerms = useMemo(
    () => clauses.filter((c) => c.enabled).map((c) => c.text.trim()).filter(Boolean).join("\n"),
    [clauses],
  );

  function updateClause(id: string, patch: Partial<ContractClause>) {
    setClauses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function addCustomClause() {
    setClauses((prev) => [...prev, { id: `custom-${Date.now()}`, text: "", enabled: true, isCustom: true }]);
  }
  function removeClause(id: string) {
    setClauses((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    try {
      const url = await uploadFile(file);
      if (url) setLogoUrl(url);
      else toast({ title: "خطأ", description: "تعذّر رفع الشعار، حاول مجدداً", variant: "destructive" });
    } finally { setLogoUploading(false); }
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const r = await apiFetch(`/owner/submissions/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: logoUrl.trim() || null, termsAndConditions: computedTerms || null }),
      });
      if (!r.ok) throw new Error("save-failed");
      qc.invalidateQueries({ queryKey: ["contractSettings-submissions"] });
      qc.invalidateQueries({ queryKey: ["/api/submissions"] });
      qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      qc.invalidateQueries({ queryKey: ["contractsArchive-chalets"] });
      toast({ title: "تم الحفظ ✓", description: "تم تحديث إعدادات العقد الرقمي بنجاح" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحفظ، يرجى المحاولة مجدداً", variant: "destructive" });
    } finally { setSaving(false); }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />جارٍ التحميل…
      </div>
    );
  }

  const chaletName = (selected as any)?.name ?? "عقاري";

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">إعدادات العقد الرقمي</h2>
          <p className="text-sm text-muted-foreground">تخصيص هوية العقار والشروط التي تظهر في عقد الإيجار</p>
        </div>
      </div>

      {/* Chalet selector */}
      {submissions.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">العقار</label>
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            {submissions.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name ?? `عقار #${s.id}`}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Logo Upload Zone ── */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h3 className="font-semibold text-foreground">شعار العقار في العقد</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">يظهر شعار العقار في رأسية العقد الموقَّع — PNG أو JPG</p>

        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) await handleLogoUpload(f); e.target.value = ""; }} />

        <div onClick={() => !logoUploading && logoInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 min-h-[110px] cursor-pointer transition-colors
            ${logoUploading ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/5"}`}>
          {logoUploading ? (
            <><Loader2 className="w-7 h-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">جارٍ رفع الشعار…</p></>
          ) : logoUrl ? (
            <div className="flex items-center gap-4 p-4 w-full">
              <img src={logoUrl} alt="شعار" className="w-16 h-16 rounded-xl object-cover border border-border shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">تم رفع الشعار</p>
                <p className="text-xs text-muted-foreground mt-0.5">انقر لتغيير الشعار</p>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setLogoUrl(""); }}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">انقر لرفع الشعار</p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG / JPG / WebP · يظهر في رأسية العقد</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Policy Clauses Builder ── */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-primary" />
          <h3 className="font-semibold text-foreground">بنود عقد الإيجار</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          هذه شروط العقار المحفوظة فقط. عدّلها أو أضف بنوداً خاصة بك؛ لا تُضاف شروط تلقائية إلى العقد.
        </p>

        <div className="space-y-3">
          {clauses.map((clause, idx) => {
            const label = `شروط العقار ${toArN(idx + 1)}`;
            return (
              <div key={clause.id}
                className={`rounded-xl border transition-all duration-150 ${clause.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20 opacity-70"}`}>
                {/* Clause header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <input type="checkbox" checked={clause.enabled}
                    onChange={(e) => updateClause(clause.id, { enabled: e.target.checked })}
                    className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0" />
                  <span className={`text-sm font-semibold flex-1 min-w-0 truncate pe-2 ${clause.enabled ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                  {clause.isCustom && (
                    <button type="button" onClick={() => removeClause(clause.id)}
                      className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-colors shrink-0 ms-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* Editable text — only when enabled */}
                {clause.enabled && (
                  <div className="px-4 pb-3 pe-4">
                    <textarea value={clause.text} rows={2} placeholder="أدخل نص البند…"
                      onChange={(e) => updateClause(clause.id, { text: e.target.value })}
                      className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add custom clause */}
        <button type="button" onClick={addCustomClause}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/40 py-2.5 text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" />
          إضافة بند إضافي مخصص
        </button>
      </div>

      {/* ── Action Row: Preview + Save ── */}
      <div className="flex gap-3">
        <button type="button" onClick={() => setShowPreview(true)}
          className="flex-1 rounded-xl border border-border bg-background text-foreground font-medium py-3 text-sm hover:bg-muted/50 transition-colors flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          معاينة العقد الرقمي
        </button>
        <button type="button" disabled={saving || !selectedId} onClick={handleSave}
          className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold py-3 text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "جارٍ الحفظ…" : "حفظ إعدادات العقد"}
        </button>
      </div>

      {/* ── Live Preview Modal ── */}
      {showPreview && (
        <Dialog open onOpenChange={(o) => !o && setShowPreview(false)}>
          <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Eye className="w-5 h-5 text-primary" />
                معاينة العقد الرقمي
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground -mt-1 mb-1">
              هذه معاينة تقريبية — البيانات الفعلية (التاريخ، التوقيع، المبالغ) تظهر في العقد الحقيقي عند توقيعه
            </p>
            <ContractPreviewCard logoUrl={logoUrl} chaletName={chaletName} terms={computedTerms} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ── Inline Contract Preview Card (live preview inside ContractSettingsTab modal) ── */
function ContractPreviewCard({ logoUrl, chaletName, terms }: { logoUrl: string; chaletName: string; terms: string }) {
  const C = {
    primary: "#8b5e2b", primaryFg: "#faf7f2", fg: "#2a2018",
    muted: "#75604a", border: "#e3d9cf", lightBg: "#fdf9f6", emerald: "#047857", white: "#ffffff",
  };
  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", direction: "rtl", textAlign: "right", fontSize: 13 }}>
      {/* Header */}
      <div style={{ background: C.primary, padding: "12px 20px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.primaryFg, letterSpacing: "-0.5px" }}>تكية</p>
        <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(250,247,242,0.8)" }}>عقد إيجار عقار رقمي موقَّع</p>
      </div>
      {/* Chalet identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: C.lightBg, borderBottom: `1px solid ${C.border}` }}>
        {logoUrl ? (
          <img src={logoUrl} alt="شعار"
            style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", border: `1px solid ${C.border}`, flexShrink: 0 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 10, background: "rgba(139,94,43,0.1)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(139,94,43,0.2)", flexShrink: 0 }}>
            <FileText style={{ width: 20, height: 20, color: "rgba(139,94,43,0.45)" }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.fg }}>{chaletName}</p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: C.muted }}>📍 القصيم، المملكة العربية السعودية</p>
        </div>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: C.primary, flexShrink: 0 }}>#١٢٣</p>
      </div>
      {/* Parties */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: "11px 14px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: C.primary, textTransform: "uppercase" }}>الطرف الأول — المؤجِّر</p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.fg }}>{chaletName}</p>
        </div>
        <div style={{ padding: "11px 14px", borderRight: `1px solid ${C.border}` }}>
          <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: C.emerald, textTransform: "uppercase" }}>الطرف الثاني — المستأجِر</p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.fg }}>عميل نموذجي</p>
        </div>
      </div>
      {/* Booking details table */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
        <p style={{ margin: "0 0 10px", fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>تفاصيل الحجز</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            <tr style={{ borderBottom: "1px solid rgba(227,217,207,0.5)" }}>
              <td style={{ padding: "5px 0", color: C.muted, width: 130 }}>اسم المستأجر</td>
              <td style={{ padding: "5px 0", fontWeight: 600, color: C.fg }}>عميل نموذجي</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(227,217,207,0.5)" }}>
              <td style={{ padding: "5px 0", color: C.muted }}>تاريخ الوصول</td>
              <td style={{ padding: "5px 0", fontWeight: 600, color: C.fg }}>١ محرم ١٤٤٧ هـ</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(227,217,207,0.5)" }}>
              <td style={{ padding: "5px 0", color: C.muted }}>مدة الإقامة</td>
              <td style={{ padding: "5px 0", color: C.fg }}>يومان · ليلة كاملة</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(227,217,207,0.5)", background: "rgba(139,94,43,0.05)" }}>
              <td style={{ padding: "5px 0", fontWeight: 700, color: C.fg }}>إجمالي الإيجار</td>
              <td style={{ padding: "5px 0", fontWeight: 700, color: C.primary }}>{contractMoney(1200)}</td>
            </tr>
            <tr>
              <td style={{ padding: "5px 0", color: C.muted }}>مبلغ التأمين</td>
              <td style={{ padding: "5px 0", color: C.fg }}>{contractMoney(300)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* Terms */}
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
        <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>الشروط والأحكام</p>
        {terms ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "#1a1008", lineHeight: 1.85, whiteSpace: "pre-wrap", fontWeight: 400 }}>{contractTermsText(terms)}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#75604a", fontStyle: "italic", lineHeight: 1.7 }}>لا توجد بنود محددة — ستُستخدم البنود الافتراضية عند التوقيع</p>
        )}
      </div>
      {/* Signature placeholder */}
      <div style={{ padding: "14px 18px" }}>
        <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>التوقيع والإثبات</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: C.lightBg, height: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ margin: 0, fontSize: 10, color: C.muted }}>✍️ توقيع المستأجر</p>
          </div>
          <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: C.lightBg, padding: 10 }}>
            <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted }}>الاسم الكامل</p>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: C.fg }}>عميل نموذجي</p>
            <p style={{ margin: "0 0 2px", fontSize: 9, color: C.muted }}>رقم الهوية</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.fg }}>٠٠٠٠٠٠٠٠٠٠</p>
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 10, color: C.muted, textAlign: "center", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          ✓ معاينة فقط · البيانات الفعلية تظهر في العقد الحقيقي عند التوقيع
        </p>
      </div>
    </div>
  );
}

/* ── Build WhatsApp contract invitation message (module-level for shared access) ── */
export function buildContractWaMsg(
  bookingDate: string,
  submissionId: number | null | undefined,
  chalets: any[],
  contractLink: string,
  period?: string | null,
  isReturning?: boolean,
  tenantName?: string,
  signed = false
): string {
  const chalet = chalets?.find((c: any) => c.submissionId === submissionId);
  const cn = chalet?.nameAr ?? "العقار";
  const arDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const dayN = arDays[new Date(bookingDate + "T12:00:00").getDay()];
  const dual = formatDualDate(bookingDate);
  const gregorianStr = dual.gregorian;
  const hijriStr = dual.hijri.replace(/\s*هـ\s*$/, "") + " هـ";
  /* ── Build period text dynamically from chalet time fields ── */
  const _t = (v: string | null | undefined) => (v ?? "").trim() || null;
  const mIn  = _t(chalet?.morningCheckIn);
  const mOut = _t(chalet?.morningCheckOut);
  const eIn  = _t(chalet?.eveningCheckIn);
  const eOut = _t(chalet?.eveningCheckOut);
  const fIn  = _t(chalet?.fullDayCheckIn);
  const fOut = _t(chalet?.fullDayCheckOut);
  const _range = (ci: string | null, co: string | null) =>
    ci && co ? ` (من ${ci} إلى ${co})` : ci ? ` (من ${ci})` : co ? ` (إلى ${co})` : "";
  const periodMap: Record<string, string> = {
    morning:  "صباحي"   + _range(mIn, mOut),
    evening:  "مسائي"   + _range(eIn, eOut),
    full_day: "يوم كامل" + _range(fIn, fOut),
    full:     "يوم كامل" + _range(fIn, fOut),
  };
  const periodText = (period && periodMap[period]?.trim()) || period || "-";
  return encodeWhatsAppText(contractInvitationText({
    clientName: tenantName, propertyName: cn, day: dayN, hijri: hijriStr,
    gregorian: gregorianStr, period: periodText, link: contractLink, signed,
  }));
}

/* ── Digital Contracts Archive Tab ───────────────────────── */
export function ContractsArchiveTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  function apiFetch(path: string, opts?: RequestInit) {
    return fetch(`${BASE}/api${path}`, { credentials: "include", ...opts });
  }

  /* ── Logo Settings ── */
  const { data: settSubs = [] } = useQuery<any[]>({
    queryKey: ["contractsTab-submissions"],
    queryFn: async () => { const r = await apiFetch("/submissions"); if (!r.ok) return []; return r.json(); },
  });
  const [settSubId, setSettSubId] = useState<number | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settSubs.length > 0 && settSubId === null) setSettSubId((settSubs[0] as any).id);
  }, [settSubs, settSubId]);

  const selectedSub = useMemo(() => settSubs.find((s: any) => s.id === settSubId), [settSubs, settSubId]);

  useEffect(() => {
    if (selectedSub) setLogoUrl((selectedSub as any).logoUrl ?? "");
  }, [selectedSub]);

  async function handleSaveSettings(overrideLogoUrl?: string) {
    if (!settSubId) return;
    setSavingSettings(true);
    try {
      const r = await apiFetch(`/owner/submissions/${settSubId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: (overrideLogoUrl ?? logoUrl).trim() || null }),
      });
      if (!r.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["contractsTab-submissions"] });
      toast({ title: "تم الحفظ ✓", description: "تم تحديث شعار العقد بنجاح" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحفظ", variant: "destructive" });
    } finally { setSavingSettings(false); }
  }

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const url = await uploadFile(file);
      if (url) {
        setLogoUrl(url);
        await handleSaveSettings(url);
      } else {
        toast({ title: "خطأ", description: "تعذّر رفع الشعار، حاول مجدداً", variant: "destructive" });
      }
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  /* ── Bookings & Filters ── */
  const [search, setSearch] = useState("");
  const [contractCalView, setContractCalView] = useState<"hijri" | "gregorian">(
    (localStorage.getItem("dashCalDefaultType") as "hijri" | "gregorian") ?? "hijri"
  );
  const [contractMonth, setContractMonth] = useState<string>("all");
  const [contractYear, setContractYear] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "signed" | "pending" | "cancelled">("all");
  const [page, setPage] = useState(1);
  const [dropdownPos, setDropdownPos] = useState<{ id: number; right: number; top: number; up: boolean } | null>(null);

  useEffect(() => {
    if (!dropdownPos) return;
    const close = () => setDropdownPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [dropdownPos]);

  const { data: bookings = [], isLoading } = useQuery<OwnerBooking[]>({
    queryKey: ["contractsArchive-bookings"],
    queryFn: async () => { const r = await apiFetch("/owner/bookings"); if (!r.ok) return []; return r.json(); },
  });

  const { data: ownerChalets = [] } = useQuery<any[]>({
    queryKey: ["contractsArchive-chalets"],
    queryFn: async () => { const r = await apiFetch("/owner/chalets"); if (!r.ok) return []; return r.json(); },
  });

  const returningPhonesSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings) { const p = (b as any).clientPhone ?? ""; if (p) counts.set(p, (counts.get(p) ?? 0) + 1); }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([p]) => p));
  }, [bookings]);

  function contractUrl(id: number) { return publicContractUrl(id, "property", BASE); }
  function copyLink(id: number) {
    navigator.clipboard.writeText(contractUrl(id)).then(() =>
      toast({ title: "تم النسخ ✓", description: "رابط العقد في الحافظة" }),
    );
  }
  function openPrint(id: number) { window.open(`${window.location.origin}${BASE}/contract/${id}`, "_blank", "noopener,noreferrer"); }

  type StatusKey = "signed" | "pending" | "cancelled";
  function statusBadge(b: OwnerBooking): { key: StatusKey; label: string; cls: string } {
    if (b.cancelledAt)    return { key: "cancelled", label: "ملغى", cls: CONTRACT_STATUS_STYLES.cancelled };
    if (b.contractSigned) return { key: "signed", label: "موقّع", cls: CONTRACT_STATUS_STYLES.signed };
    return { key: "pending", label: "قيد الانتظار", cls: CONTRACT_STATUS_STYLES.pending };
  }

  /* ── Year options built from actual bookings ── */
  const contractYearOptions = useMemo(() => {
    const years = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      years.add(getBookingMonthKey(b.bookingDate, contractCalView).split("-")[0]);
    }
    return Array.from(years).sort().reverse();
  }, [bookings, contractCalView]);

  /* ── Month options filtered by selected year ── */
  const monthOptions = useMemo(() => {
    const keySet = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const key = getBookingMonthKey(b.bookingDate, contractCalView);
      if (contractYear && !key.startsWith(contractYear)) continue;
      keySet.add(key);
    }
    return Array.from(keySet).sort();
  }, [bookings, contractCalView, contractYear]);

  const monthFiltered = useMemo(() => {
    if (contractMonth !== "all") {
      return bookings.filter((b) => b.bookingDate && getBookingMonthKey(b.bookingDate, contractCalView) === contractMonth);
    }
    if (contractYear) {
      return bookings.filter((b) => b.bookingDate && getBookingMonthKey(b.bookingDate, contractCalView).startsWith(contractYear));
    }
    return bookings;
  }, [bookings, contractMonth, contractYear, contractCalView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (!q) return monthFiltered;
    return monthFiltered.filter((b) =>
      String(b.id).includes(q) ||
      (b.clientName ?? "").toLowerCase().includes(q) ||
      (b.clientPhone ?? "").replace(/\D/g, "").includes(q),
    );
  }, [monthFiltered, search]);

  const displayed = useMemo(() => {
    if (filterStatus === "all") return filtered;
    return filtered.filter((b) => statusBadge(b).key === filterStatus);
  }, [filtered, filterStatus]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const paginated = useMemo(
    () => displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [displayed, page],
  );

  useEffect(() => { setPage(1); }, [search, contractMonth, contractCalView, filterStatus]);

  const signed    = bookings.filter((b) => b.contractSigned).length;
  const pending   = bookings.filter((b) => !b.contractSigned && !b.cancelledAt).length;
  const cancelled = bookings.filter((b) => !!b.cancelledAt).length;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-5" dir="rtl">

      {/* ── Settings Panel ── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Settings className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">إعدادات العقد الرقمي</h3>
            <p className="text-xs text-muted-foreground">شعار العقار الظاهر في رأس العقد</p>
          </div>
        </div>

        {/* Chalet selector — only when multiple chalets exist */}
        {settSubs.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">اختر العقار</label>
            <select
              value={settSubId ?? ""}
              onChange={(e) => setSettSubId(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
            >
              {settSubs.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name ?? `عقار #${s.id}`}</option>
              ))}
            </select>
          </div>
        )}

        {/* Logo upload */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">شعار العقار في رأس العقد <span className="font-normal">(اختياري)</span></label>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleLogoFileChange}
          />
          <div className="flex items-center gap-3">
            {/* Preview thumbnail */}
            {logoUrl ? (
              <div className="relative shrink-0">
                <img
                  src={logoUrl}
                  alt="شعار العقد"
                  className="w-16 h-16 rounded-xl object-contain border border-border bg-muted/30 p-1"
                />
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  title="إزالة الشعار"
                  className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs leading-none hover:bg-destructive/80 transition-colors"
                >
                  ×
                </button>
              </div>
            ) : null}
            {/* Upload button / drop zone */}
            <button
              type="button"
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
              className={`flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 transition-colors text-sm font-medium ${
                logoUploading
                  ? "border-primary/30 bg-primary/5 text-primary cursor-not-allowed"
                  : "border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary cursor-pointer"
              }`}
            >
              {logoUploading ? (
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

        {/* Conditions notice */}
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            📋 <span className="font-semibold">تنويه:</span> يتم سحب شروط وأحكام العقد تلقائيًا من "إعدادات العقار".
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("switch-dashboard-tab", { detail: "chalets" }))}
            className="shrink-0 text-xs font-medium text-primary border border-primary/30 bg-primary/5 rounded-lg px-3 py-1.5 hover:bg-primary/10 transition-colors whitespace-nowrap"
          >
            ⚙️ تعديل الشروط من إعدادات العقار
          </button>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={savingSettings || !settSubId}
            onClick={() => handleSaveSettings()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingSettings ? "جارٍ الحفظ…" : "حفظ إعدادات العقد"}
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
          <p className="text-sm text-muted-foreground">سجل كامل بجميع عقود الإيجار الموقَّعة والمعلَّقة</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { suffix: "موقّع", value: signed, color: "", bg: CONTRACT_STATUS_STYLES.signed },
          { suffix: "قيد الانتظار", value: pending, color: "", bg: CONTRACT_STATUS_STYLES.pending },
          { suffix: "ملغى", value: cancelled, color: "", bg: CONTRACT_STATUS_STYLES.cancelled },
        ].map(({ suffix, value, color, bg }) => {
          const noun = value >= 3 && value <= 10 ? "عقود" : "عقد";
          return (
          <div key={suffix} className={`rounded-xl border px-4 py-3 text-center ${bg}`}>
            <p className={`text-2xl font-bold ${color}`}>{toAr(value)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{noun} {suffix}</p>
          </div>
        );
        })}
      </div>

      {/* ── Filter Bar ── */}
      <div className="space-y-2">
        {/* Row 1: Unified time filters [هجري|ميلادي] → [Year] → [Month] */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {/* Hijri / Gregorian toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
            {(["hijri", "gregorian"] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => { setContractCalView(mode); setContractMonth("all"); setContractYear(""); }}
                className={`text-xs px-3 py-1.5 font-medium transition-colors ${contractCalView === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >{mode === "hijri" ? "هجري" : "ميلادي"}</button>
            ))}
          </div>
          {/* Year dropdown */}
          <Select value={contractYear || "__all__"} onValueChange={(yr) => { setContractYear(yr === "__all__" ? "" : yr); setContractMonth("all"); }}>
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7rem] shrink-0" dir="rtl">
              {contractYear
                ? <span className="text-sm font-medium">{contractCalView === "hijri" ? `${toArN(Number(contractYear))} هـ` : `${toArN(Number(contractYear))} م`}</span>
                : <span className="text-sm text-muted-foreground">كل السنوات</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
              <SelectItem value="__all__"><span className="text-sm">كل السنوات</span></SelectItem>
              {contractYearOptions.map(yr => (
                <SelectItem key={yr} value={yr}>
                  {contractCalView === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Month dropdown — cascades from year */}
          <Select
            value={!contractYear ? "all" : contractMonth}
            onValueChange={(v) => { if (contractYear) setContractMonth(v); }}
            disabled={!contractYear}
          >
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[8rem] shrink-0" dir="rtl">
              {contractMonth !== "all" && contractYear ? (() => {
                const ms = Number(contractMonth.split("-")[1]);
                return contractCalView === "hijri"
                  ? <span className="font-medium">{HIJRI_MONTHS_AR[ms - 1]}</span>
                  : <span className="font-medium">{GREGORIAN_MONTHS_AR[ms - 1]}</span>;
              })() : <span className="text-muted-foreground">كل العقود</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end" className="z-[100]">
              <SelectItem value="all"><span className="text-sm">كل العقود</span></SelectItem>
              {monthOptions.map(key => {
                const [ys, ms] = key.split("-").map(Number);
                const primary = contractCalView === "hijri" ? `${HIJRI_MONTHS_AR[ms-1]} ${toArN(ys)} هـ` : `${GREGORIAN_MONTHS_AR[ms-1]} ${toArN(ys)} م`;
                const corr = getCalCorrespondenceHint(key, contractCalView);
                return (
                  <SelectItem key={key} value={key} textValue={primary}>
                    <div style={{width:"100%",direction:"rtl"}}>
                      <div style={{fontWeight:"600",fontSize:"13px",textAlign:"right"}}>{primary}</div>
                      {corr && <div style={{fontSize:"11px",color:"#888",textAlign:"right",marginTop:"1px"}}>{corr}</div>}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        {/* Search bar */}
        <div className="relative" dir="rtl">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الحجز أو الجوال…"
            className="w-full rounded-xl border border-border bg-background pr-10 pl-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-right"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Row 2: Status tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "signed", "pending", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterStatus === s
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
        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> جارٍ التحميل…
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <ScrollText className="w-10 h-10 opacity-20" />
            <p className="text-sm">{search || filterStatus !== "all" || contractMonth !== "all" ? "لا توجد نتائج مطابقة" : "لا توجد عقود حتى الآن"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-right">
                  <th className="px-4 py-3 font-semibold text-muted-foreground w-16">رقم</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">اسم المستأجر</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">الجوال</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">حالة العقد</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">تاريخ الحجز</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((b, idx) => {
                  const status = statusBadge(b);
                  const dualDt = b.bookingDate ? formatDualDate(b.bookingDate) : null;
                  const waUrl = b.clientPhone
                    ? `https://wa.me/${b.clientPhone.replace(/\D/g, "").replace(/^0/, "966")}?text=${buildContractWaMsg(b.bookingDate, b.submissionId, ownerChalets, contractUrl(b.id), (b as any).period, returningPhonesSet.has((b as any).clientPhone ?? ""), (b as any).clientName, status.key === "signed")}`
                    : null;
                  return (
                    <tr
                      key={b.id}
                      className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-primary">#{toAr(b.id)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2" dir="rtl">
                          <span className="font-medium text-foreground">{b.clientName}</span>
                          {returningPhonesSet.has((b as any).clientPhone ?? "") && (
                            <span className="shrink-0 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">عميل سابق</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {b.clientPhone
                          ? <span className="text-xs text-foreground">{b.clientPhone}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold border ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {dualDt ? (
                          <div className="text-xs">
                            {contractCalView === "hijri" ? (
                              <>
                                <p className="text-foreground font-semibold">{dualDt.hijri.replace(/\s*هـ\s*$/, "")} هـ</p>
                                <p className="text-muted-foreground">{dualDt.gregorian}</p>
                              </>
                            ) : (
                              <>
                                <p className="text-foreground font-semibold">{dualDt.gregorian} م</p>
                                <p className="text-muted-foreground">{dualDt.hijri.replace(/\s*هـ\s*$/, "")} هـ</p>
                              </>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      {/* Actions dropdown */}
                      <td className="px-4 py-3 text-center">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={(e) => {
                              if (dropdownPos?.id === b.id) {
                                setDropdownPos(null);
                              } else {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const up = window.innerHeight - rect.bottom < 200;
                                setDropdownPos({
                                  id: b.id,
                                  right: window.innerWidth - rect.right,
                                  top: up ? window.innerHeight - rect.top + 4 : rect.bottom + 4,
                                  up,
                                });
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-medium text-foreground hover:bg-muted/60 hover:border-primary/40 transition-colors"
                          >
                            الإجراءات
                            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${dropdownPos?.id === b.id ? "rotate-180" : ""}`} />
                          </button>
                          {dropdownPos?.id === b.id && createPortal(
                            <>
                              <div className="fixed inset-0 z-[9998]" onClick={() => setDropdownPos(null)} />
                              <div
                                className="fixed z-[9999] w-48 rounded-xl border border-border bg-card shadow-xl py-1"
                                style={{ direction: "rtl", right: dropdownPos.right, ...(dropdownPos.up ? { bottom: dropdownPos.top } : { top: dropdownPos.top }) }}
                              >
                                <button
                                  type="button"
                                  onClick={() => { openPrint(b.id); setDropdownPos(null); }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-right text-sm hover:bg-muted/60 transition-colors text-foreground"
                                >
                                  📄 عرض العقد
                                </button>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setDropdownPos(null)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-right text-sm hover:bg-muted/60 transition-colors text-foreground"
                                  >
                                    💬 إرسال عبر الواتساب
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => { openPrint(b.id); setDropdownPos(null); }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-right text-sm hover:bg-muted/60 transition-colors text-foreground"
                                >
                                  🖨️ طباعة العقد
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { copyLink(b.id); setDropdownPos(null); }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-right text-sm hover:bg-muted/60 transition-colors text-foreground"
                                >
                                  🔗 نسخ رابط العقد
                                </button>
                              </div>
                            </>,
                            document.body
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
        {!isLoading && displayed.length > 0 && (
          <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-2 flex-wrap" dir="rtl">
            {/* Counter */}
            <span className="text-xs text-muted-foreground">
              {(() => {
                const from = (page - 1) * PAGE_SIZE + 1;
                const to   = Math.min(page * PAGE_SIZE, displayed.length);
                const t    = displayed.length;
                const noun = (n: number) => n >= 3 && n <= 10 ? "عقود" : "عقد";
                return t <= PAGE_SIZE
                  ? `${toAr(t)} ${noun(t)}`
                  : `عرض ${toAr(from)} - ${toAr(to)} من أصل ${toAr(t)} ${noun(t)}`;
              })()}
            </span>
            {/* Page nav */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="h-7 px-2.5 rounded-lg border border-border text-xs font-semibold bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >السابق</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce<(number | "…")[]>((acc, n, i, arr) => {
                    if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, i) =>
                    n === "…"
                      ? <span key={`sep-${i}`} className="text-xs text-muted-foreground px-1">…</span>
                      : <button
                          key={n}
                          type="button"
                          onClick={() => setPage(n as number)}
                          className={`h-7 w-7 rounded-lg border text-xs font-semibold transition-colors ${page === n ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground hover:bg-muted"}`}
                        >{toAr(n as number)}</button>
                  )}
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="h-7 px-2.5 rounded-lg border border-border text-xs font-semibold bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >التالي</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
