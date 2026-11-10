import { buildInsuranceReport, filterInsuranceEntries, canSettleInsurance, insuranceAmounts, type InsuranceEntry } from "@/lib/insuranceReport";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useRef } from "react";
import { getOwnerDeposits } from "@workspace/api-client-react";
import { toAr } from "@/lib/utils";
import { formatDualDate, HIJRI_MONTHS_AR, toHijriComponents, getHijriMonthGregorianRange } from "@/lib/hijri";
import takyahLogoSrc from "@/assets/platform-logo.png";
import { motion } from "framer-motion";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Lock, Camera, Loader2, Archive } from "lucide-react";
import { Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DepositBookingHeading } from "@/components/owner/DepositBookingHeading";
import { INSURANCE_NOT_READY_MESSAGE } from "@workspace/booking-time";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { toArN } from "@/components/owner/owner-formatting";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { GREGORIAN_MONTHS_AR, getCalCorrespondenceHint } from "@/components/owner/owner-calendar";


/* ── DepositsTab ─────────────────────────────── */
type DepositEntry = InsuranceEntry;

export function DepositsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [refundConfirm, setRefundConfirm] = useState<DepositEntry | null>(null);
  const [deductDialog, setDeductDialog] = useState<DepositEntry | null>(null);
  const [deductAmount, setDeductAmount] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "resolved">("all");
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterChalet, setFilterChalet] = useState("all");
  const [calendarMode, setCalendarMode] = useState<"hijri" | "gregorian">("hijri");
  const [currentPage, setCurrentPage] = useState(1);
  const [stayClock, setStayClock] = useState(Date.now);
  const [insuranceExporting, setInsuranceExporting] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setStayClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const { data: deposits = [], isLoading, isFetching: depositsFetching, isError: depositsError } = useQuery<DepositEntry[]>({
    queryKey: ["owner", "deposits"],
    queryFn: () => getOwnerDeposits({ credentials: "include" }),
    refetchInterval: 30_000,
  });
  const canSettleDeposit = (entry: DepositEntry) => {
    const latest = deposits.find(deposit => deposit.id === entry.id);
    return !depositsError && !!latest && canSettleInsurance(latest, stayClock);
  };

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Record<string, unknown> }) => {
      const r = await apiFetch(`/owner/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || "فشل");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "deposits"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "bookings"] });
    },
  });

  const handleRefund = async () => {
    if (!refundConfirm || !canSettleDeposit(refundConfirm)) return;
    try {
      await patchMutation.mutateAsync({
        id: refundConfirm.id,
        patch: { insuranceRefunded: true, insuranceDeducted: 0, insuranceDeductReason: null },
      });
      toast({ title: "✅ تم تسجيل إعادة التأمين بنجاح" });
      setRefundConfirm(null);
    } catch {
      toast({ title: "حدث خطأ أثناء التحديث", variant: "destructive" });
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(`${BASE}/api/storage/uploads/process`, {
          credentials: "include",
          method: "POST",
          body: fd,
        });
        if (!r.ok) throw new Error("upload failed");
        const data = await r.json();
        newUrls.push(data.url as string);
      }
      setProofUrls((prev) => [...prev, ...newUrls]);
      toast({ title: `✅ تم رفع ${toAr(newUrls.length)} صورة بنجاح` });
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDeduct = async () => {
    if (!deductDialog || !canSettleDeposit(deductDialog)) return;
    const amount = Number(deductAmount);
    if (!amount || amount <= 0) {
      toast({ title: "أدخل مبلغ الخصم بشكل صحيح", variant: "destructive" });
      return;
    }
    if (!deductReason.trim()) {
      toast({ title: "أدخل سبب الخصم", variant: "destructive" });
      return;
    }
    const maxDeduct = Number(deductDialog.insuranceFee);
    if (amount > maxDeduct) {
      toast({ title: `لا يمكن الخصم أكثر من مبلغ التأمين (${toAr(maxDeduct)} ر.س)`, variant: "destructive" });
      return;
    }
    try {
      await patchMutation.mutateAsync({
        id: deductDialog.id,
        patch: {
          insuranceRefunded: true,
          insuranceDeducted: amount,
          insuranceDeductReason: deductReason,
          insuranceProofImages: proofUrls,
        },
      });
      toast({ title: "✅ تم توثيق الخصم بنجاح" });
      setDeductDialog(null);
      setDeductAmount("");
      setDeductReason("");
      setProofUrls([]);
    } catch {
      toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" });
    }
  };

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    deposits.forEach((d) => {
      if (!d.bookingDate) return;
      if (calendarMode === "gregorian") {
        years.add(d.bookingDate.slice(0, 4));
      } else {
        const h = toHijriComponents(new Date(d.bookingDate + "T00:00:00"));
        years.add(String(h.year));
      }
    });
    return Array.from(years).sort().reverse();
  }, [deposits, calendarMode]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    deposits.forEach((d) => {
      if (!d.bookingDate) return;
      if (calendarMode === "gregorian") {
        const ym = d.bookingDate.slice(0, 7);
        if (filterYear && !ym.startsWith(filterYear)) return;
        months.add(ym);
      } else {
        const h = toHijriComponents(new Date(d.bookingDate + "T00:00:00"));
        const ym = `${h.year}-${String(h.month).padStart(2, "0")}`;
        if (filterYear && !ym.startsWith(filterYear)) return;
        months.add(ym);
      }
    });
    return Array.from(months).sort().reverse();
  }, [deposits, calendarMode, filterYear]);

  const availableChalets = useMemo(() => {
    const map = new Map<string, string>();
    deposits.forEach((d) => {
      if (d.submissionId) map.set(String(d.submissionId), d.chaletTitle ?? `عقار #${d.submissionId}`);
    });
    return Array.from(map.entries());
  }, [deposits]);

  const monthParts = (ym: string): { primary: string; secondary: string } => {
    const [y, m] = ym.split("-").map(Number);
    const gregMonthName = (gy: number, gm: number) =>
      new Date(gy, gm, 15).toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });

    if (calendarMode === "hijri") {
      // Primary: Hijri month name + year
      const primary = `${HIJRI_MONTHS_AR[m - 1]} ${toArN(y)} هـ`;
      // Secondary: overlapping Gregorian months
      const { start, end } = getHijriMonthGregorianRange(y, m);
      let secondary = "";
      if (start && end) {
        const s = new Date(start + "T00:00:00");
        const e = new Date(end + "T00:00:00");
        const sY = s.getFullYear(), sM = s.getMonth();
        const eY = e.getFullYear(), eM = e.getMonth();
        if (sY === eY && sM === eM) {
          secondary = `${gregMonthName(sY, sM)} ${toArN(sY)}`;
        } else if (sY === eY) {
          secondary = `${gregMonthName(sY, sM)} / ${gregMonthName(eY, eM)} ${toArN(sY)}`;
        } else {
          secondary = `${gregMonthName(sY, sM)} ${toArN(sY)} / ${gregMonthName(eY, eM)} ${toArN(eY)}`;
        }
      }
      return { primary, secondary };
    }

    // Gregorian mode: Primary = Gregorian month + year
    const primary = `${gregMonthName(y, m - 1)} ${toArN(y)}`;
    // Secondary: overlapping Hijri months
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const h1 = toHijriComponents(firstDay);
    const h2 = toHijriComponents(lastDay);
    let secondary = "";
    if (h1.year === h2.year && h1.month === h2.month) {
      secondary = `${HIJRI_MONTHS_AR[h1.month - 1]} ${toArN(h1.year)} هـ`;
    } else if (h1.year === h2.year) {
      secondary = `${HIJRI_MONTHS_AR[h1.month - 1]} / ${HIJRI_MONTHS_AR[h2.month - 1]} ${toArN(h1.year)} هـ`;
    } else {
      secondary = `${HIJRI_MONTHS_AR[h1.month - 1]} ${toArN(h1.year)} / ${HIJRI_MONTHS_AR[h2.month - 1]} ${toArN(h2.year)} هـ`;
    }
    return { primary, secondary };
  };

  const insuranceFilters = { status: filterStatus, month: filterMonth, year: filterYear, chalet: filterChalet, search: searchQuery, calendar: calendarMode };
  const filtered = useMemo(() => filterInsuranceEntries(deposits, insuranceFilters),
    [deposits, filterStatus, filterMonth, filterYear, filterChalet, searchQuery, calendarMode]);

  async function exportInsurance(format: "xlsx" | "pdf") {
    if (insuranceExporting || depositsError || depositsFetching || !filtered.length) return;
    setInsuranceExporting(true);
    const filters = { ...insuranceFilters };
    try {
      const [freshEntries, response] = await Promise.all([
        getOwnerDeposits({ credentials: "include" }), apiFetch("/owner/profile"),
      ]);
      if (!response.ok) throw new Error("تعذّر تحميل هوية المالك للتقرير");
      const profile = await response.json();
      const entries = filterInsuranceEntries(freshEntries, filters);
      if (!entries.length) { toast({ title: "لا توجد تأمينات مطابقة للتصدير" }); return; }
      const preference = profile.reportsCalPref === "gregorian" ? "gregorian" : profile.reportsCalPref === "hijri" ? "hijri" : filters.calendar;
      const table = buildInsuranceReport(entries, preference);
      const { exportArchiveFile } = await import("@/lib/bookingArchiveExport");
      await exportArchiveFile(format, table, {
        ownerName: profile.fullName || profile.businessName || "اسم المالك غير مسجل",
        ownerPhone: profile.phone || "", platformLogoUrl: takyahLogoSrc, calendarPreference: preference,
        propertyNames: [...new Set(entries.map(entry => entry.chaletTitle || "عقار غير متاح"))],
        issuedAt: new Date().toISOString(),
        search: [
          filters.status === "pending" ? "بانتظار القرار" : filters.status === "resolved" ? "تمت التسوية" : "",
          filters.month ? `الشهر: ${filters.month} (${filters.calendar === "hijri" ? "هجري" : "ميلادي"})`
            : filters.year ? `السنة: ${filters.year} (${filters.calendar === "hijri" ? "هجري" : "ميلادي"})` : "",
          filters.search ? `البحث: ${filters.search}` : "",
        ].filter(Boolean).join(" | "),
      });
    } catch (error) {
      toast({ title: "تعذّر تصدير تقرير التأمينات", description: error instanceof Error ? error.message : "أعد المحاولة", variant: "destructive" });
    } finally { setInsuranceExporting(false); }
  }

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedFiltered = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pendingCount = deposits.filter((d) => !d.insuranceRefunded).length;

  const periodLabel = (p?: string | null) => {
    if (p === "morning") return "🌅 صباحي";
    if (p === "evening") return "🌙 مسائي";
    if (p === "full_day") return "☀️ كامل";
    return "";
  };

  const getStatus = (d: DepositEntry): "pending" | "refunded" | "deducted" => {
    if (!d.insuranceRefunded) return "pending";
    if (d.insuranceDeducted && Number(d.insuranceDeducted) > 0) return "deducted";
    return "refunded";
  };

  const fmtMoney = (n: number | string) =>
    Number(n).toLocaleString("ar-SA", { maximumFractionDigits: 0 });

  const parseProofImgs = (raw?: string | null): string[] => {
    try { return JSON.parse(raw ?? "[]"); } catch { return []; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-foreground">إدارة التأمينات</h2>
            <SectionGuideButton sectionKey="deposits" />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            جميع الحجوزات التي تحتوي على مبلغ تأمين
          </p>
        </div>
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button className="h-auto min-h-10 gap-2 whitespace-normal text-center text-xs sm:text-sm" disabled={insuranceExporting || depositsFetching || depositsError || !filtered.length} data-testid="export-insurance-report">
              {insuranceExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {insuranceExporting ? "جارٍ التصدير..." : "تصدير تقرير التأمينات (Excel / PDF)"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => exportInsurance("xlsx")} data-testid="export-insurance-xlsx">تصدير Excel</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportInsurance("pdf")} data-testid="export-insurance-pdf">تصدير PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {pendingCount > 0 && (
          <span className="self-start sm:self-auto bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-sm font-semibold px-3 py-1.5 rounded-full">
            🔒 {toAr(pendingCount)} بانتظار القرار
          </span>
        )}
      </div>

      {/* Summary Cards — dynamic: reflects active filters */}
      {deposits.length > 0 && (() => {
        const totalDeposits  = filtered.reduce((s, d) => s + Number(d.insuranceFee), 0);
        let balances: ReturnType<typeof insuranceAmounts>[];
        try { balances = filtered.map(insuranceAmounts); }
        catch (error) { return <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "تعذّر حساب أرصدة التأمينات"}</p>; }
        const totalDeducted = balances.reduce((s, d) => s + Math.round(d.deducted * 100), 0) / 100;
        const totalRefundable = balances.reduce((s, d) => s + Math.round(d.held * 100), 0) / 100;
        const totalReturned = balances.reduce((s, d) => s + Math.round(d.returned * 100), 0) / 100;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-3 text-center">
              <div className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-1">إجمالي التأمينات</div>
              <div className="text-lg font-bold text-orange-700 dark:text-orange-300">{fmtMoney(totalDeposits)}</div>
              <div className="text-xs text-muted-foreground">ر.س</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
              <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">إجمالي التلفيات</div>
              <div className="text-lg font-bold text-red-700 dark:text-red-300">{fmtMoney(totalDeducted)}</div>
              <div className="text-xs text-muted-foreground">ر.س</div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">محتجز (معلّق)</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{fmtMoney(totalRefundable)}</div>
              <div className="text-xs text-muted-foreground">ر.س</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-3 text-center">
              <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">المبالغ المُعادة</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">{fmtMoney(totalReturned)}</div>
              <div className="text-xs text-muted-foreground">ر.س</div>
            </div>
          </div>
        );
      })()}

      {/* Search + Filters */}
      <div className="space-y-2">
        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="🔍 بحث باسم العميل أو رقم الجوال..."
            className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            dir="rtl"
            autoComplete="off"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >✕</button>
          )}
        </div>
        {searchQuery && !isLoading && (
          <p className="text-xs px-1 text-muted-foreground">
            {filtered.length > 0
              ? `${toArN(filtered.length)} نتيجة مطابقة`
              : `لا توجد نتائج لـ «${searchQuery}»`}
          </p>
        )}
        {/* Unified time filter bar: [هجري|ميلادي] → [Year] → [Month] */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {/* Calendar mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
            {(["hijri", "gregorian"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setCalendarMode(mode); setFilterMonth(""); setFilterYear(""); setCurrentPage(1); }}
                className={`text-xs px-3 py-1.5 font-medium transition-colors ${
                  calendarMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {mode === "hijri" ? "هجري" : "ميلادي"}
              </button>
            ))}
          </div>

          {/* Year dropdown */}
          <Select
            value={filterYear || "__all__"}
            onValueChange={(yr) => { setFilterYear(yr === "__all__" ? "" : yr); setFilterMonth(""); setCurrentPage(1); }}
          >
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7rem] shrink-0" dir="rtl">
              {filterYear
                ? <span className="text-sm font-medium">{calendarMode === "hijri" ? `${toArN(Number(filterYear))} هـ` : `${toArN(Number(filterYear))} م`}</span>
                : <span className="text-sm text-muted-foreground">كل السنوات</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
              <SelectItem value="__all__"><span className="text-sm">كل السنوات</span></SelectItem>
              {availableYears.map(yr => (
                <SelectItem key={yr} value={yr}>
                  {calendarMode === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month dropdown — cascades from year, locked when كل السنوات */}
          <Select
            value={!filterYear ? "__all__" : (filterMonth || "__all__")}
            onValueChange={(v) => { if (filterYear) { setFilterMonth(v === "__all__" ? "" : v); setCurrentPage(1); } }}
            disabled={!filterYear}
          >
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[8rem] shrink-0" dir="rtl">
              {filterMonth && filterYear ? (() => {
                const [, ms] = filterMonth.split("-").map(Number);
                return calendarMode === "hijri"
                  ? <span className="font-medium">{HIJRI_MONTHS_AR[ms - 1]}</span>
                  : <span className="font-medium">{GREGORIAN_MONTHS_AR[ms - 1]}</span>;
              })() : <span className="text-muted-foreground">كل التأمينات</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
              <SelectItem value="__all__"><span className="text-sm">كل التأمينات</span></SelectItem>
              {availableMonths.map((ym) => {
                const [ys, ms] = ym.split("-").map(Number);
                const primary = calendarMode === "hijri" ? `${HIJRI_MONTHS_AR[ms-1]} ${toArN(ys)} هـ` : `${GREGORIAN_MONTHS_AR[ms-1]} ${toArN(ys)} م`;
                const corr = getCalCorrespondenceHint(ym, calendarMode);
                return (
                  <SelectItem key={ym} value={ym} textValue={primary}>
                    <div style={{width:"100%",direction:"rtl"}}>
                      <div style={{fontWeight:"600",fontSize:"13px",textAlign:"right"}}>{primary}</div>
                      {corr && <div style={{fontSize:"11px",color:"#888",textAlign:"right",marginTop:"1px"}}>{corr}</div>}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Chalet dropdown */}
          {availableChalets.length > 1 && (
            <select
              value={filterChalet}
              onChange={(e) => { setFilterChalet(e.target.value); setCurrentPage(1); }}
              className="text-sm rounded-lg border border-border bg-background px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 h-9 shrink-0"
              dir="rtl"
            >
              <option value="all">🏡 كل العقارات</option>
              {availableChalets.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}

        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setFilterStatus(s); setCurrentPage(1); }}
            className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "الكل" : s === "pending" ? "🔒 معلّق" : "✅ مُنتهٍ"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Lock className="w-12 h-12 mx-auto mb-3 opacity-20" />
          {searchQuery ? (
            <>
              <p className="font-medium">لا توجد نتائج لـ «{searchQuery}»</p>
              <p className="text-sm mt-1">جرّب البحث باسم العميل أو رقم الجوال</p>
            </>
          ) : (
            <>
              <p className="font-medium">لا توجد تأمينات {filterStatus !== "all" ? "في هذه الفئة" : ""}</p>
              <p className="text-sm mt-1">ستظهر هنا الحجوزات التي تحتوي على مبلغ تأمين</p>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">التقرير يشمل جميع التأمينات المطابقة للفلاتر، وليس الصفحة الحالية فقط. المحتجز يُحسب من التأمين المستلم فقط.</p>
      {depositsError && <p role="alert" className="text-sm text-destructive">تعذّر تحديث التأمينات ومواعيد الخروج؛ قرارات التسوية والتصدير مقفلة حتى نجاح الاتصال.</p>}
      {/* Cards */}
      {!isLoading && pagedFiltered.map((d) => {
        const status = getStatus(d);
        const isCancelled = !!d.cancelledAt;
        const ins = Number(d.insuranceFee);
        const deducted = Number(d.insuranceDeducted ?? 0);
        const refundable = Math.max(0, ins - deducted);
        const proofImgs = parseProofImgs(d.insuranceProofImages);

        return (
          <div
            key={d.id}
            className={`rounded-2xl border p-4 space-y-3 transition-all ${
              isCancelled
                ? "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/5 opacity-75"
                : status === "pending"
                ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/5"
                : status === "deducted"
                ? "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/5"
                : "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/5"
            }`}
          >
            {/* Row 1: Client + status badge */}
            <DepositBookingHeading id={d.id} checkoutAt={d.checkoutAt} ready={canSettleDeposit(d)} settled={d.insuranceRefunded} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-foreground truncate">{d.clientName}</div>
                {d.clientPhone && (
                  <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">{toAr(d.clientPhone)}</div>
                )}
                {d.chaletTitle && (
                  <div className="text-xs text-muted-foreground mt-0.5">🏡 {d.chaletTitle}</div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">
                  {(() => {
                    const _dual = d.bookingDate ? formatDualDate(d.bookingDate) : null;
                    return _dual ? (
                      <span>
                        📅 {_dual.hijri.replace(/\s*هـ\s*$/, "")}
                        <span className="opacity-60 ms-1">({_dual.gregorian})</span>
                      </span>
                    ) : (
                      <span>📅 —</span>
                    );
                  })()}
                  {d.durationDays > 1 && ` · ${toAr(d.durationDays)} أيام`}
                  {d.period && ` · ${periodLabel(d.period)}`}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {isCancelled && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">✕ ملغى</span>
                )}
                {!isCancelled && status === "pending" && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">🔒 معلّق</span>
                )}
                {status === "refunded" && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✅ مُعاد</span>
                )}
                {status === "deducted" && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">✂️ مخصوم</span>
                )}
              </div>
            </div>

            {/* Row 2: Finance formula */}
            <div className="bg-background/60 rounded-xl border border-border/50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">مبلغ التأمين الأصلي</span>
                <span className="font-bold text-orange-600 dark:text-orange-400">{fmtMoney(ins)} ر.س</span>
              </div>
              {deducted > 0 && (
                <div className="flex items-center justify-between text-sm mt-1.5">
                  <span className="text-muted-foreground">المبلغ المخصوم (تلفيات)</span>
                  <span className="font-bold text-red-600 dark:text-red-400">− {fmtMoney(deducted)} ر.س</span>
                </div>
              )}
              <div className="border-t border-border/50 mt-2 pt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  {status === "pending" ? "المبلغ المُستردّ" : "المبلغ المُعاد للعميل"}
                </span>
                <span className={`font-bold text-lg ${refundable > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                  {fmtMoney(refundable)} ر.س
                </span>
              </div>
            </div>

            {/* Deduction reason */}
            {d.insuranceDeductReason && (
              <div className="text-sm bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/50 rounded-lg px-3 py-2">
                <span className="font-semibold text-red-700 dark:text-red-400">سبب الخصم: </span>
                <span className="text-red-800 dark:text-red-300">{d.insuranceDeductReason}</span>
              </div>
            )}

            {/* Proof image thumbnails */}
            {proofImgs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">📸 صور التوثيق ({toAr(proofImgs.length)})</p>
                <div className="flex gap-2 flex-wrap">
                  {proofImgs.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxImg(url)}
                      className="w-16 h-16 rounded-lg overflow-hidden border border-border hover:border-primary transition-colors shrink-0"
                    >
                      <img
                        src={url.startsWith("http") ? url : `${BASE}${url}`}
                        alt={`توثيق ${toAr(i + 1)}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons — hidden for cancelled bookings */}
            {status === "pending" && !isCancelled && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20 gap-1.5"
                  disabled={!canSettleDeposit(d) || patchMutation.isPending}
                  title={!canSettleDeposit(d) ? INSURANCE_NOT_READY_MESSAGE : undefined}
                  onClick={() => setRefundConfirm(d)}
                >
                  <CheckCircle className="w-4 h-4" />
                  إعادة التأمين
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 gap-1.5"
                  disabled={!canSettleDeposit(d) || patchMutation.isPending}
                  title={!canSettleDeposit(d) ? INSURANCE_NOT_READY_MESSAGE : undefined}
                  onClick={() => {
                    if (!canSettleDeposit(d)) return;
                    setDeductDialog(d);
                    setDeductAmount("");
                    setDeductReason("");
                    setProofUrls([]);
                  }}
                >
                  <Camera className="w-4 h-4" />
                  خصم مع توثيق
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2" dir="rtl">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            → السابق
          </button>
          <span className="text-sm text-muted-foreground px-2">
            صفحة {toArN(safePage)} من {toArN(totalPages)}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            التالي ←
          </button>
        </div>
      )}

      {/* Refund Confirm Dialog */}
      <Dialog open={!!refundConfirm} onOpenChange={(o) => !o && setRefundConfirm(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد إعادة التأمين</DialogTitle>
            <DialogDescription>
              هل تؤكد إعادة مبلغ التأمين كاملاً (
              <strong>{refundConfirm ? fmtMoney(Number(refundConfirm.insuranceFee)) : 0} ر.س</strong>)
              للعميل <strong>{refundConfirm?.clientName}</strong>؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setRefundConfirm(null)}>إلغاء</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleRefund}
              disabled={patchMutation.isPending || !refundConfirm || !canSettleDeposit(refundConfirm)}
            >
              {patchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "✅ تأكيد الإعادة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deduct Dialog */}
      <Dialog open={!!deductDialog} onOpenChange={(o) => !o && setDeductDialog(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>خصم مع توثيق الضرر</DialogTitle>
            <DialogDescription>
              تأمين <strong>{deductDialog?.clientName}</strong> — الأصلي:{" "}
              <strong className="text-orange-600">{deductDialog ? fmtMoney(Number(deductDialog.insuranceFee)) : 0} ر.س</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Amount */}
            {(() => {
              const maxIns = deductDialog ? Number(deductDialog.insuranceFee) : 0;
              const enteredVal = Number(deductAmount) || 0;
              const overMax = enteredVal > maxIns;
              return (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">مبلغ الخصم (ر.س) *</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder={`أقصى مبلغ: ${toArN(maxIns)}`}
                  value={deductAmount ? toArN(deductAmount) : ""}
                  onChange={(e) => {
                    const raw = e.target.value
                      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                      .replace(/[^\d]/g, "");
                    setDeductAmount(raw);
                  }}
                  className={`text-right ${overMax ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                {overMax && (
                  <p className="text-xs text-red-600 font-medium">
                    ⚠️ لا يمكن أن يتجاوز مبلغ الخصم قيمة التأمين الأصلية ({toArN(maxIns)} ر.س)
                  </p>
                )}
                {/* Live formula preview */}
                {deductAmount && deductDialog && enteredVal > 0 && (
                  <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">الأصلي</span>
                      <span className="font-medium">{toArN(maxIns)} ر.س</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>الخصم</span>
                      <span className="font-medium">− {toArN(enteredVal)} ر.س</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1 font-bold">
                      <span>المستردّ</span>
                      <span className={Math.max(0, maxIns - enteredVal) > 0 ? "text-green-600" : "text-muted-foreground"}>
                        {toArN(Math.max(0, maxIns - enteredVal))} ر.س
                      </span>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">سبب الخصم *</label>
              <Textarea
                placeholder="مثال: كسر في المرآة، بقع على السجادة..."
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                rows={2}
                className="text-right resize-none"
              />
            </div>

            {/* Photo Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">صور التوثيق (اختياري)</label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => handlePhotoUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-dashed"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الرفع...</>
                ) : (
                  <><Camera className="w-4 h-4" /> التقاط صورة أو اختيار من المعرض</>
                )}
              </Button>
              {proofUrls.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {proofUrls.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                      <img
                        src={url.startsWith("http") ? url : `${BASE}${url}`}
                        alt={`صورة ${toAr(i + 1)}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => setProofUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute inset-0 bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                يمكنك رفع صور متعددة للتأكد من توثيق الضرر. تعمل مع كاميرا الجوال مباشرة.
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setDeductDialog(null)}>إلغاء</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
              onClick={handleDeduct}
              disabled={patchMutation.isPending || uploading || !deductDialog || !canSettleDeposit(deductDialog) || !deductReason.trim() || (deductDialog ? Number(deductAmount) > Number(deductDialog.insuranceFee) : false) || !deductAmount || Number(deductAmount) <= 0}
            >
              {patchMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Archive className="w-4 h-4" /> حفظ الخصم والتوثيق</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg.startsWith("http") ? lightboxImg : `${BASE}${lightboxImg}`}
            alt="صورة التوثيق"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 left-4 text-white bg-black/50 rounded-full p-2"
            onClick={() => setLightboxImg(null)}
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
