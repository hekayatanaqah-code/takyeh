import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle, Trash2, Sunrise, Edit2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { formatDualDate } from "@/lib/hijri";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { useServiceErp } from "@/components/owner/OwnerDashboardContexts";
import { apiFetch } from "@/components/owner/owner-api";


/* ── Service Seasons Tab ──────────────────────────────────── */
export function ServiceSeasonsTab() {
  const { providerId } = useServiceErp();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [seasonMode, setSeasonMode] = useState<"global" | "custom">("global");
  const [globalSeasonId, setGlobalSeasonId] = useState<number | null>(null);
  const emptyForm = { name: "", startDate: "", endDate: "", priceLabel: "", isActive: true };
  const [form, setForm] = useState({ ...emptyForm });

  const { data: seasons = [], isLoading, isError: seasonsError } = useQuery<any[]>({
    queryKey: ["service-seasons", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/seasons`);
      if (!r.ok) throw new Error("تعذّر تحميل مواسم الخدمة");
      return r.json();
    },
    enabled: !!providerId,
  });

  const { data: globalSeasons = [], isLoading: globalLoading, isError: globalError, refetch: retryGlobalSeasons } = useQuery<{
    id: number; nameAr: string; startDate: string; endDate: string;
  }[]>({
    queryKey: ["service-global-seasons"],
    queryFn: async () => {
      const r = await apiFetch("/providers/global-seasons");
      if (!r.ok) throw new Error("تعذّر تحميل المواسم العامة");
      return r.json();
    },
    enabled: showForm && !!providerId,
    staleTime: 0,
  });

  function resetSeasonForm() {
    setForm({ ...emptyForm }); setEditId(null); setGlobalSeasonId(null);
    setSeasonMode("global"); setShowForm(false);
  }

  useEffect(() => {
    resetSeasonForm();
  }, [providerId]);

  function selectGlobalSeason(value: string) {
    const season = globalSeasons.find(s => s.id === Number(value));
    setGlobalSeasonId(season?.id ?? null);
    setForm(p => ({ ...p, name: season?.nameAr ?? "", startDate: season?.startDate ?? "", endDate: season?.endDate ?? "" }));
  }

  async function handleSave() {
    if (seasonMode === "global" && !globalSeasonId) {
      toast({ title: "اختر موسمًا من قائمة المواسم العامة", variant: "destructive" });
      return;
    }
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      toast({ title: "بيانات ناقصة — اسم الموسم والتواريخ مطلوبة", variant: "destructive" });
      return;
    }
    if (form.endDate < form.startDate) {
      toast({ title: "تاريخ الانتهاء يجب ألا يسبق تاريخ البدء", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const method = editId ? "PATCH" : "POST";
      const url = editId ? `/providers/my/approved/${providerId}/seasons/${editId}` : `/providers/my/approved/${providerId}/seasons`;
      const payload = seasonMode === "global"
        ? { priceLabel: form.priceLabel, isActive: form.isActive, ...(editId ? {} : { globalSeasonId }) }
        : { ...form, name: form.name.trim(), multiplier: "1.00" };
      const r = await apiFetch(url, { method, body: JSON.stringify(payload) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "خطأ"); }
      queryClient.invalidateQueries({ queryKey: ["service-seasons", providerId] });
      toast({ title: editId ? "تم تعديل الموسم ✓" : "تم إضافة الموسم ✓" });
      resetSeasonForm();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/seasons/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
      queryClient.invalidateQueries({ queryKey: ["service-seasons", providerId] });
      if (editId === id) resetSeasonForm();
      toast({ title: "تم الحذف" });
    } catch { toast({ title: "خطأ", description: "فشل الحذف", variant: "destructive" }); }
    finally { setDeletingId(null); }
  }

  function startEdit(s: any) {
    setForm({ name: s.name, startDate: s.startDate, endDate: s.endDate, priceLabel: s.priceLabel ?? "", isActive: s.isActive });
    setSeasonMode(s.globalSeasonId ? "global" : "custom"); setGlobalSeasonId(s.globalSeasonId ?? null);
    setEditId(s.id); setShowForm(true);
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button onClick={() => { resetSeasonForm(); setShowForm(true); }} className="gap-2 rounded-xl" variant="outline">
          <Plus className="w-4 h-4" />تسجيل موسم جديد
        </Button>
      )}

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-foreground">{editId ? "تعديل الموسم" : "موسم جديد"}</h3>
          {!editId && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" aria-label="نوع الموسم">
                <Button variant={seasonMode === "global" ? "default" : "outline"} aria-pressed={seasonMode === "global"}
                  onClick={() => { setSeasonMode("global"); setGlobalSeasonId(null); setForm({ ...emptyForm }); }} className="rounded-xl">
                  المواسم العامة
                </Button>
                <Button variant={seasonMode === "custom" ? "default" : "outline"} aria-pressed={seasonMode === "custom"}
                  onClick={() => { setSeasonMode("custom"); setGlobalSeasonId(null); setForm({ ...emptyForm }); }} className="rounded-xl gap-2">
                  <Plus className="w-4 h-4" />إضافة موسم مخصص
                </Button>
              </div>
              {seasonMode === "global" && (
                <div className="space-y-2">
                  <label htmlFor="service-global-season" className="text-xs font-semibold text-muted-foreground">اختر الموسم العام *</label>
                  {globalLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل المواسم العامة...</p>
                    : globalError ? <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                      تعذّر تحميل المواسم العامة
                      <Button variant="outline" size="sm" onClick={() => { void retryGlobalSeasons(); }}>إعادة المحاولة</Button>
                    </div> : globalSeasons.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد مواسم عامة متاحة حاليًا. يمكنك إضافة موسم مخصص.</p>
                    : <select id="service-global-season" dir="rtl" value={globalSeasonId ?? ""} onChange={e => selectGlobalSeason(e.target.value)}
                        className="w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                      <option value="">اختر موسمًا...</option>
                      {globalSeasons.map(s => {
                        const registered = seasons.some(row => row.globalSeasonId === s.id);
                        return <option key={s.id} value={s.id} disabled={registered}>
                          {s.nameAr}{registered ? " (مسجل بالفعل)" : ""}
                        </option>;
                      })}
                    </select>}
                  <p className="text-xs text-muted-foreground">اسم الموسم العام وتواريخه تُدار من إدارة المنصة ولا يمكن تعديلها هنا.</p>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="service-season-name" className="text-xs font-semibold text-muted-foreground">اسم الموسم *</label>
              <Input id="service-season-name" dir="rtl" value={form.name} readOnly={seasonMode === "global"} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={seasonMode === "global" ? "يُحدد عند اختيار الموسم العام" : "موسم الصيف، موسم الأعياد..."} className="rounded-xl text-right" />
              {editId && seasonMode === "global" && <p className="text-xs text-muted-foreground">اسم الموسم وتواريخه تُدار من إدارة المنصة.</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">ملاحظة سعرية (اختياري)</label>
              <Input value={form.priceLabel} onChange={e => setForm(p => ({ ...p, priceLabel: e.target.value }))} placeholder="مثال: أسعار مرتفعة، عروض خاصة..." className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">تاريخ البدء *</label>
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
                {seasonMode === "global"
                  ? <p className="text-sm">{form.startDate ? `${formatDualDate(form.startDate).hijri} · ${formatDualDate(form.startDate).gregorian}` : "يُحدد عند اختيار الموسم العام"}</p>
                  : <DualCalendarPicker value={form.startDate} onChange={v => setForm(p => ({ ...p, startDate: v, endDate: p.endDate && p.endDate < v ? "" : p.endDate }))} placeholder="اختر تاريخ البدء" label="من تاريخ" />}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">تاريخ الانتهاء *</label>
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
                {seasonMode === "global"
                  ? <p className="text-sm">{form.endDate ? `${formatDualDate(form.endDate).hijri} · ${formatDualDate(form.endDate).gregorian}` : "يُحدد عند اختيار الموسم العام"}</p>
                  : <DualCalendarPicker value={form.endDate} onChange={v => setForm(p => ({ ...p, endDate: v }))} placeholder="اختر تاريخ الانتهاء" label="إلى تاريخ" minDate={form.startDate || undefined} />}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" disabled={saving} onClick={resetSeasonForm} className="rounded-xl">إلغاء</Button>
            <Button onClick={handleSave} disabled={saving || (seasonMode === "global" && !editId && (globalLoading || globalError || !globalSeasonId))} className="rounded-xl gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}حفظ
            </Button>
          </div>
        </motion.div>
      )}

      {seasonsError ? <p className="text-sm text-destructive">تعذّر تحميل مواسم الخدمة. يرجى إعادة المحاولة.</p>
        : isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        : seasons.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Sunrise className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">لا توجد مواسم مسجلة بعد</p>
            <p className="text-xs mt-1">سجّل مواسم لتنظيم جدول خدمتك (إجازات، مواسم الذروة...)</p>
          </div>
        ) : (
          <div className="space-y-3">
            {seasons.map((s: any) => {
              const dualStart = formatDualDate(s.startDate);
              const dualEnd   = formatDualDate(s.endDate);
              return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{s.name}</span>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{s.globalSeasonId ? "موسم عام" : "موسم مخصص"}</span>
                      {s.priceLabel && <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">{s.priceLabel}</span>}
                      {!s.isActive && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">معطل</span>}
                    </div>
                    <p className="text-xs text-primary font-medium mt-0.5">{dualStart.hijri} هـ → {dualEnd.hijri} هـ</p>
                    <p className="text-xs text-muted-foreground">{dualStart.gregorian} → {dualEnd.gregorian}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(s)} className="rounded-lg h-8 w-8"><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} disabled={deletingId === s.id} className="rounded-lg h-8 w-8 text-red-500 hover:text-red-600">
                      {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
    </div>
  );
}
