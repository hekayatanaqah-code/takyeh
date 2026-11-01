import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { Plus, Trash2, Building2, Globe, Sun, Lock, Loader2, Activity, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toAr } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDualDate } from "@/lib/hijri";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { ChaletSeason, DayPrice, GlobalSeason } from "@/components/owner/owner-booking-types";
import { apiFetch } from "@/components/owner/owner-api";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


/* ── Seasons Tab ─────────────────────────────── */
export function SeasonsTab({ ownerChalets }: { ownerChalets: any[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editSeasonId, setEditSeasonId] = useState<number | null>(null);
  const [editGlobalSeasonId, setEditGlobalSeasonId] = useState<number | null>(null);
  const [nameAr, setNameAr] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priceMorning, setPriceMorning] = useState("");
  const [priceEvening, setPriceEvening] = useState("");
  const [priceFullDay, setPriceFullDay] = useState("");
  const [dailyPricesState, setDailyPricesState] = useState<Record<string, { morning: string; evening: string; fullDay: string }>>({});
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setNameAr(""); setStartDate(""); setEndDate("");
    setPriceMorning(""); setPriceEvening(""); setPriceFullDay("");
    setDailyPricesState({});
    setEditSeasonId(null);
    setEditGlobalSeasonId(null);
  }

  function openEdit(s: any) {
    setEditGlobalSeasonId(null);
    setNameAr(s.nameAr ?? "");
    setStartDate(s.startDate ?? "");
    setEndDate(s.endDate ?? "");
    const toInt = (v: any) => v ? String(Math.round(Number(v))) : "";
    setPriceMorning(toInt(s.priceMorning));
    setPriceEvening(toInt(s.priceEvening));
    setPriceFullDay(toInt(s.priceFullDay));
    const dp = s.dailyPrices as Record<string, DayPrice> | null;
    if (dp) {
      const filled: Record<string, { morning: string; evening: string; fullDay: string }> = {};
      Object.entries(dp).forEach(([date, entry]) => {
        filled[date] = {
          morning: entry.morning != null ? String(Math.round(entry.morning)) : "",
          evening: entry.evening != null ? String(Math.round(entry.evening)) : "",
          fullDay: entry.fullDay != null ? String(Math.round(entry.fullDay)) : "",
        };
      });
      setDailyPricesState(filled);
    } else {
      setDailyPricesState({});
    }
    setEditSeasonId(s.id);
    setAddOpen(true);
  }

  function openGlobalPricing(season: GlobalSeason) {
    setNameAr(season.nameAr);
    setStartDate(season.startDate.split("T")[0]);
    setEndDate(season.endDate.split("T")[0]);
    const toInt = (value: string | null) => value != null ? String(Math.round(Number(value))) : "";
    setPriceMorning(toInt(season.priceMorning));
    setPriceEvening(toInt(season.priceEvening));
    setPriceFullDay(toInt(season.priceFullDay));
    const filled: Record<string, { morning: string; evening: string; fullDay: string }> = {};
    Object.entries(season.dailyPrices ?? {}).forEach(([date, entry]) => {
      filled[date] = {
        morning: entry.morning != null ? String(Math.round(entry.morning)) : "",
        evening: entry.evening != null ? String(Math.round(entry.evening)) : "",
        fullDay: entry.fullDay != null ? String(Math.round(entry.fullDay)) : "",
      };
    });
    setDailyPricesState(filled);
    setEditSeasonId(null);
    setEditGlobalSeasonId(season.id);
    setAddOpen(true);
  }

  const activeSubId = selectedSubId ?? ownerChalets[0]?.submissionId ?? null;

  /* Generate ordered list of dates in range */
  const dayList = useMemo<string[]>(() => {
    if (!startDate || !endDate || endDate < startDate) return [];
    const days: string[] = [];
    const cur = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    while (cur <= end) {
      days.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [startDate, endDate]);

  const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const toWest = (v: string) => v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");

  function setDayField(ds: string, field: "morning" | "evening" | "fullDay", raw: string) {
    const val = toWest(raw);
    setDailyPricesState(prev => ({ ...prev, [ds]: { ...(prev[ds] ?? { morning: "", evening: "", fullDay: "" }), [field]: val } }));
  }

  function applyToAll() {
    if (!dayList.length) return;
    const entry = { morning: priceMorning, evening: priceEvening, fullDay: priceFullDay };
    const next: Record<string, { morning: string; evening: string; fullDay: string }> = {};
    dayList.forEach(ds => { next[ds] = { ...entry }; });
    setDailyPricesState(next);
  }

  const { data: seasons = [], isLoading } = useQuery<ChaletSeason[]>({
    queryKey: ["owner", "seasons", activeSubId],
    queryFn: async () => {
      if (!activeSubId) return [];
      const r = await apiFetch(`/owner/seasons?submissionId=${activeSubId}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeSubId,
  });

  const {
    data: globalSeasons = [],
    isLoading: globalSeasonsLoading,
    isError: globalSeasonsError,
    refetch: refetchGlobalSeasons,
  } = useQuery<GlobalSeason[]>({
    queryKey: ["owner", "global-seasons", activeSubId],
    queryFn: async () => {
      if (!activeSubId) return [];
      const r = await apiFetch(`/owner/global-seasons?submissionId=${activeSubId}`);
      if (!r.ok) throw new Error("تعذّر تحميل المواسم المركزية");
      return r.json();
    },
    enabled: !!activeSubId,
  });

  const globalSeasonMutation = useMutation({
    mutationFn: async ({
      id,
      enabled,
      pricing,
    }: {
      id: number;
      enabled: boolean;
      pricing?: {
        priceMorning?: number | null;
        priceEvening?: number | null;
        priceFullDay?: number | null;
        dailyPrices?: Record<string, DayPrice> | null;
      };
    }) => {
      if (!activeSubId) throw new Error("لم يتم اختيار العقار");
      const r = await apiFetch(`/owner/global-seasons/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ submissionId: activeSubId, enabled, ...pricing }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "تعذّر تحديث الموسم");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "global-seasons", activeSubId] });
      toast({ title: "تم تحديث الموسم للعقار" });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/owner/seasons/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "seasons"] }); toast({ title: "تم حذف الموسم" }); },
  });

  const periodLabel = (p: string | null) => {
    if (!p) return "جميع الفترات";
    if (p === "morning") return "صباحي";
    if (p === "evening") return "مسائي";
    return "يوم كامل";
  };

  const normPrice = (v: string) => v ? Number(v) : undefined;

  async function handleAdd() {
    const hasSeasonPrice = !!(priceMorning || priceEvening || priceFullDay);
    const hasDailyPrice = Object.values(dailyPricesState).some(dp => dp.morning || dp.evening || dp.fullDay);
    if (!activeSubId || !nameAr.trim() || !startDate || !endDate || (!hasSeasonPrice && !hasDailyPrice)) return;
    setSaving(true);
    try {
      /* Build dailyPrices payload — only include days in range with at least one price */
      const dpPayload: Record<string, DayPrice> = {};
      dayList.forEach(ds => {
        const dp = dailyPricesState[ds];
        if (!dp) return;
        const entry: DayPrice = {};
        if (dp.morning) entry.morning = Number(dp.morning);
        if (dp.evening) entry.evening = Number(dp.evening);
        if (dp.fullDay) entry.fullDay = Number(dp.fullDay);
        if (Object.keys(entry).length > 0) dpPayload[ds] = entry;
      });
      if (editGlobalSeasonId) {
        await globalSeasonMutation.mutateAsync({
          id: editGlobalSeasonId,
          enabled: true,
          pricing: {
            priceMorning: normPrice(priceMorning) ?? null,
            priceEvening: normPrice(priceEvening) ?? null,
            priceFullDay: normPrice(priceFullDay) ?? null,
            dailyPrices: Object.keys(dpPayload).length > 0 ? dpPayload : null,
          },
        });
        setAddOpen(false);
        resetForm();
        return;
      }
      const url = editSeasonId ? `/owner/seasons/${editSeasonId}` : "/owner/seasons";
      const method = editSeasonId ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        nameAr: nameAr.trim(),
        startDate,
        endDate,
        priceMorning: normPrice(priceMorning),
        priceEvening: normPrice(priceEvening),
        priceFullDay: normPrice(priceFullDay),
        dailyPrices: Object.keys(dpPayload).length > 0 ? dpPayload : undefined,
      };
      if (!editSeasonId) body.submissionId = activeSubId;
      const r = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); toast({ title: e.error ?? "خطأ", variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["owner", "seasons"] });
      toast({ title: editSeasonId ? "تم تحديث الموسم بنجاح" : "تم إضافة الموسم بنجاح" });
      setAddOpen(false);
      resetForm();
    } finally { setSaving(false); }
  }

  if (ownerChalets.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">لا يوجد عقار معتمد بعد. بعد موافقة الإدارة يمكنك إضافة المواسم.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground text-lg">المواسم والأعياد</h3>
            <SectionGuideButton sectionKey="seasons" />
          </div>
          <p className="text-sm text-muted-foreground">حدد فترات بأسعار خاصة تُطبَّق تلقائياً على الحجوزات</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setAddOpen(true); }} className="gap-1.5 rounded-xl">
          <Plus className="w-4 h-4" />
          إضافة موسم
        </Button>
      </div>

      {/* Chalet selector if multiple */}
      {ownerChalets.length > 1 && activeSubId && (
        <Select value={String(activeSubId)} onValueChange={(v) => setSelectedSubId(Number(v))}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="اختر العقار" />
          </SelectTrigger>
          <SelectContent>
            {ownerChalets.map((c: any) => (
              <SelectItem key={c.id} value={String(c.submissionId)}>{c.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Centrally managed seasons — enabled separately for each property */}
      <section className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h4 className="font-bold text-foreground">المواسم المركزية من الإدارة</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              فعّل الموسم لهذا العقار ليُطبّق في تقويم الحجوزات. هذه المواسم تُدار مركزياً ولا يمكن تعديل بياناتها من هنا.
            </p>
          </div>
        </div>
        {globalSeasonsLoading ? (
          <div className="flex items-center justify-center py-5 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin ml-2" /> جارٍ تحميل المواسم المركزية...
          </div>
        ) : globalSeasonsError ? (
          <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-3 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-red-700 dark:text-red-300">تعذّر تحميل المواسم المركزية.</p>
            <Button size="sm" variant="outline" onClick={() => refetchGlobalSeasons()} className="h-8 text-xs">إعادة المحاولة</Button>
          </div>
        ) : globalSeasons.length === 0 ? (
          <p className="text-xs text-muted-foreground bg-background/50 rounded-xl px-3 py-4 text-center">
            لا توجد مواسم مركزية متاحة حالياً.
          </p>
        ) : (
          <div className="space-y-2">
            {globalSeasons.map((season) => (
              <div key={season.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-3">
                <span
                  className="w-3 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: season.color || "#f59e0b" }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{season.nameAr}</p>
                    {!season.isActive && <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">غير نشط</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {season.startDate.split("T")[0].split("-").reverse().join("/")} → {season.endDate.split("T")[0].split("-").reverse().join("/")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex" tabIndex={season.enabled ? undefined : 0} aria-label={season.enabled ? undefined : "فعّل الموسم لتتمكن من تحديد الأسعار"}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5"
                      disabled={!season.enabled}
                      onClick={() => openGlobalPricing(season)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      تخصيص الأسعار
                    </Button>
                      </span>
                    </TooltipTrigger>
                    {!season.enabled && <TooltipContent dir="rtl">فعّل الموسم لتتمكن من تحديد الأسعار</TooltipContent>}
                  </UiTooltip>
                  <span className="text-xs text-muted-foreground">{season.enabled ? "مفعّل" : "غير مفعّل"}</span>
                  <Switch
                    checked={season.enabled}
                    onCheckedChange={(enabled) => {
                      if (enabled) openGlobalPricing(season);
                      else globalSeasonMutation.mutate({ id: season.id, enabled: false });
                    }}
                    disabled={globalSeasonMutation.isPending || !season.isActive}
                    aria-label={`تفعيل ${season.nameAr}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Seasons list */}
      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : seasons.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-10 text-center">
          <Sun className="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">لا توجد مواسم مضافة بعد</p>
          <p className="text-xs text-muted-foreground mt-1">أضف موسماً كالإجازات والأعياد بأسعار خاصة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map((s) => {
            const days = Math.round((new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 86400000) + 1;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <Sun className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{s.nameAr}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span>{s.startDate.split("-").reverse().join("/")} → {s.endDate.split("-").reverse().join("/")}</span>
                    <span>({toAr(days)} يوم)</span>
                  </div>
                  {/* Price display — variable daily pricing or fixed */}
                  {(() => {
                    const dp = s.dailyPrices;
                    const dpEntries = dp ? Object.values(dp) : [];
                    const hasDaily = dpEntries.length > 0;
                    if (hasDaily) {
                      const allPrices = dpEntries.flatMap(e => [e.morning, e.evening, e.fullDay].filter(Boolean) as number[]);
                      const minP = Math.min(...allPrices);
                      const maxP = Math.max(...allPrices);
                      const isVariable = minP !== maxP;
                      return (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                          {isVariable ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              أسعار متغيرة (تبدأ من {toAr(minP)} ر.س)
                            </span>
                          ) : (
                            <span className="text-primary font-medium">
                              {toAr(minP)} ر.س / يوم
                            </span>
                          )}
                          <span className="text-muted-foreground/60">· {toAr(days)} {days === 1 ? "يوم" : "أيام"} بأسعار مفصّلة</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                        {s.priceMorning && <span className="text-sky-700 dark:text-sky-400">☀️ {toAr(Number(s.priceMorning))} ر.س</span>}
                        {s.priceEvening && <span className="text-indigo-700 dark:text-indigo-400">🌙 {toAr(Number(s.priceEvening))} ر.س</span>}
                        {s.priceFullDay && <span className="text-emerald-700 dark:text-emerald-400">📅 {toAr(Number(s.priceFullDay))} ر.س</span>}
                        {!s.priceMorning && !s.priceEvening && !s.priceFullDay && (
                          <span className="text-primary font-semibold">{toAr(Number(s.price))} ر.س</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted w-8 h-8"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 w-8 h-8"
                    onClick={() => deleteMutation.mutate(s.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 px-4 py-3 flex items-start gap-3">
        <Activity className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          عند تحديد نطاق تاريخ معين كموسم، سيتم تطبيق أسعار الأعياد والإجازات تلقائياً في نافذة الحجوزات دون الحاجة لتغيير سعرك الأساسي.
        </p>
      </div>

      {/* Add Season Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) { setAddOpen(false); resetForm(); } }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              {editGlobalSeasonId ? `أسعار موسم ${nameAr}` : editSeasonId ? "تعديل الموسم" : "إضافة موسم جديد"}
            </DialogTitle>
            <DialogDescription>
              {editGlobalSeasonId
                ? "حدد أسعار هذا الموسم للعقار المختار. اسم الموسم وتواريخه تُدار من الإدارة."
                : "حدد اسم الموسم ونطاق التواريخ وأسعار كل يوم"}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 space-y-4 py-2 pl-1">
            {/* Name */}
            <div className="space-y-2">
              <label htmlFor="property-season-name" className="text-sm font-medium flex items-center gap-1.5">
                اسم الموسم
                {!!editGlobalSeasonId && <Lock className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />}
              </label>
              <Input id="property-season-name" aria-describedby={editGlobalSeasonId ? "property-season-name-hint" : undefined} placeholder="اسم الموسم..." value={nameAr} onChange={(e) => setNameAr(e.target.value)} disabled={!!editGlobalSeasonId} />
              {!!editGlobalSeasonId && <p id="property-season-name-hint" className="text-xs text-muted-foreground">اسم الموسم محدد آلياً من إدارة المنصة</p>}
              {!editGlobalSeasonId && <div className="flex gap-2 flex-wrap pt-1">
                {["عيد الأضحى", "عيد الفطر", "رمضان", "الإجازة الصيفية", "نهاية السنة", "الإجازة الشتوية"].map((n) => (
                  <button key={n} onClick={() => setNameAr(n)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${nameAr === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                    {n}
                  </button>
                ))}
              </div>}
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">من تاريخ</label>
                {editGlobalSeasonId
                  ? <div className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm">{formatDualDate(startDate).hijri} · {formatDualDate(startDate).gregorian}</div>
                  : <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
                      <DualCalendarPicker value={startDate} onChange={setStartDate} placeholder="يوم / شهر / سنة" />
                    </div>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">إلى تاريخ</label>
                {editGlobalSeasonId
                  ? <div className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm">{formatDualDate(endDate).hijri} · {formatDualDate(endDate).gregorian}</div>
                  : <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
                      <DualCalendarPicker value={endDate} onChange={setEndDate} placeholder="يوم / شهر / سنة" minDate={startDate || undefined} />
                    </div>}
              </div>
            </div>

            {/* Default (apply-to-all) prices */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-semibold text-amber-800 dark:text-amber-300">الأسعار الافتراضية (ر.س)</label>
                {dayList.length > 0 && (
                  <button
                    type="button"
                    onClick={applyToAll}
                    disabled={!priceMorning && !priceEvening && !priceFullDay}
                    className="text-xs font-medium px-3 py-1 rounded-full bg-amber-600 text-white disabled:opacity-40 hover:bg-amber-700 transition-colors"
                  >
                    تطبيق على كل الأيام ({toAr(dayList.length)})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: "☀️ صباحي", val: priceMorning, set: setPriceMorning },
                  { label: "🌙 مسائي", val: priceEvening, set: setPriceEvening },
                  { label: "📅 يوم كامل", val: priceFullDay, set: setPriceFullDay },
                ] as const).map(({ label, val, set }) => (
                  <div key={label} className="space-y-1">
                    <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{label}</span>
                    <Input
                      type="text" inputMode="numeric" placeholder=""
                      value={val ? toAr(val) : ""}
                      onChange={(e) => (set as (v: string) => void)(toWest(e.target.value))}
                      className="h-8 text-right text-sm"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500">أدخل الأسعار ثم اضغط "تطبيق على كل الأيام"، أو عدّل كل يوم بشكل منفرد أدناه</p>
            </div>

            {/* Daily price rows */}
            {dayList.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">التسعير اليومي التفصيلي</label>
                  <span className="text-xs text-muted-foreground">{toAr(dayList.length)} يوم</span>
                </div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_90px_90px_90px] gap-1.5 px-1 text-xs text-muted-foreground font-medium">
                  <span>اليوم والتاريخ</span>
                  <span className="text-center">☀️ صباحي</span>
                  <span className="text-center">🌙 مسائي</span>
                  <span className="text-center">📅 كامل</span>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                  {dayList.map((ds) => {
                    const d = new Date(ds + "T12:00:00");
                    const dp = dailyPricesState[ds] ?? { morning: "", evening: "", fullDay: "" };
                    const dayName = AR_DAYS[d.getDay()];
                    const dayNum = toAr(d.getDate());
                    const monthName = AR_MONTHS[d.getMonth()];
                    const isFriday = d.getDay() === 5;
                    const isSaturday = d.getDay() === 6;
                    const { hijri } = formatDualDate(ds);
                    const hijriClean = hijri.replace(/\s*هـ\s*$/, "");
                    return (
                      <div
                        key={ds}
                        className={`grid grid-cols-[1fr_90px_90px_90px] items-center gap-1.5 py-1.5 px-1 rounded-lg border-b border-border/30 last:border-0 ${isFriday || isSaturday ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}
                      >
                        <div className="text-xs leading-tight min-w-0">
                          <p className={`text-[10px] font-semibold ${isFriday ? "text-emerald-600" : isSaturday ? "text-sky-600" : "text-muted-foreground"}`}>{dayName}</p>
                          <p className="font-bold text-foreground truncate">{hijriClean} هـ</p>
                          <p className="text-[10px] text-muted-foreground/70">{dayNum} {monthName}</p>
                        </div>
                        {(["morning", "evening", "fullDay"] as const).map((field) => (
                          <Input
                            key={field}
                            type="text" inputMode="numeric" placeholder="—"
                            value={dp[field] ? toAr(dp[field]) : ""}
                            onChange={(e) => setDayField(ds, field, e.target.value)}
                            className="h-7 text-center text-xs px-1"
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No dates selected hint */}
            {!startDate || !endDate ? (
              <div className="text-center py-3 text-xs text-muted-foreground">
                اختر نطاق التواريخ أعلاه لتظهر الأيام التفصيلية
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 shrink-0 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>إلغاء</Button>
            <Button
              disabled={
                !nameAr.trim() || !startDate || !endDate || startDate > endDate ||
                !(priceMorning || priceEvening || priceFullDay || Object.values(dailyPricesState).some(dp => dp.morning || dp.evening || dp.fullDay)) ||
                saving
              }
              onClick={handleAdd}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editSeasonId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editGlobalSeasonId ? "حفظ الأسعار وتفعيل الموسم" : editSeasonId ? "حفظ التغييرات" : "حفظ الموسم"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
