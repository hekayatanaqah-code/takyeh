import { type PropertyListView } from "@/lib/owner-service-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { formatDualDate } from "@/lib/hijri";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { MapPin, CheckCircle, Home, Trash2, Building2, AlertTriangle, RotateCcw, Lock, Zap, DollarSign, Loader2, ExternalLink, Eye, PauseCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { toAr } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { SubmissionDate } from "@/components/owner/SubmissionDate";
import { apiFetch } from "@/components/owner/owner-api";
import { OwnerPlanLimits } from "@/components/owner/SubscriptionAccountBanner";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { BlockDatesDialog, EditChaletDialog, PauseChaletDialog, ResubmitDialog, UpgradePlanDialog } from "@/components/owner/PropertyRegistrationDialogs";
import { statusConfig } from "@/components/owner/owner-booking-types";
import { getLocalDateStr, groupBlockedDatesIntoRanges, isCurrentPause } from "@/components/owner/owner-calendar";


/* ════════════════════════════════════════════════════════════════ */

export function ChaletsTab({ submissions, isLoading, ownerChalets, onRequestAddon, listView = "approved" }: { submissions: any[] | undefined; isLoading: boolean; ownerChalets: any[]; onRequestAddon: () => void; listView?: PropertyListView }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{ id: number; nameAr: string } | null>(null);
  const [pauseTarget, setPauseTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<any | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  async function handleToggleChaletActive(chaletId: number) {
    setTogglingId(chaletId);
    try {
      const r = await apiFetch(`/owner/chalets/${chaletId}/toggle-active`, { method: "PATCH" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "فشل");
      qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      toast({ title: d.isActive ? "تم التفعيل ✓" : "تم الإيقاف", description: d.isActive ? "العقار ظاهر الآن للعملاء" : "العقار مخفي مؤقتاً عن الزوار" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally { setTogglingId(null); }
  }

  async function handleDeleteChalet(chaletId: number) {
    setDeletingId(chaletId);
    try {
      const r = await apiFetch(`/owner/chalets/${chaletId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) {
        if (d.hasUpcomingBookings) {
          toast({ title: "لا يمكن الحذف", description: "لا يمكن الحذف لوجود حجوزات مستقبلية. أوقف النشاط مؤقتاً.", variant: "destructive" });
        } else {
          toast({ title: "خطأ", description: d.error ?? "فشل الحذف", variant: "destructive" });
        }
        return;
      }
      qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
      toast({ title: "تم الحذف", description: "تم حذف العقار نهائياً. تبقى السجلات المالية متاحة." });
    } catch {
      toast({ title: "خطأ", description: "فشل الحذف، حاول مجدداً", variant: "destructive" });
    } finally { setDeletingId(null); setDeleteConfirmId(null); }
  }

  async function handlePauseChalet(chaletId: number, pausedFrom: string | null, pausedUntil: string | null, clear = false) {
    const r = await apiFetch(`/owner/chalets/${chaletId}/pause`, {
      method: "PATCH",
      body: JSON.stringify(clear ? { clear: true } : { pausedFrom, pausedUntil }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "فشل حفظ الإيقاف المؤقت");
    qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
    toast({
      title: clear ? "تم إلغاء الإيقاف ✓" : "تم ضبط الإيقاف المؤقت ✓",
      description: clear ? "سيعود العقار للظهور حسب حالة النشاط" : "سيُخفى العقار عن الزوار خلال فترة الإيقاف",
    });
  }

  const { data: planLimits } = useQuery<OwnerPlanLimits>({
    queryKey: ["owner", "plan-limits"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", active: true, scope: "full", chaletLimit: 1, chaletCount: 0, serviceLimit: 1, serviceCount: 0 };
      return r.json();
    },
  });

  const { data: allBlocks = [] } = useQuery<Array<{ id: number; chaletId: number; dateStr: string; notes: string | null }>>({
    queryKey: ["owner", "availability"],
    queryFn: async () => {
      const r = await apiFetch("/owner/availability");
      if (!r.ok) return [];
      return r.json();
    },
  });

  async function handleUnblockRange(chaletId: number, startDate: string, endDate: string) {
    try {
      const r = await apiFetch("/owner/availability/range", {
        method: "DELETE",
        body: JSON.stringify({ chaletId, startDate, endDate }),
      });
      if (!r.ok) throw new Error("فشل إلغاء الإغلاق");
      qc.invalidateQueries({ queryKey: ["owner", "availability"] });
      const startFmt = formatDualDate(startDate);
      const endFmt   = formatDualDate(endDate);
      toast({ title: "تم إعادة فتح الأيام ✓", description: `من ${startFmt.hijri} إلى ${endFmt.hijri}` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  }

  const atChaletLimit = planLimits
    ? planLimits.active === false || planLimits.chaletCount >= planLimits.chaletLimit
    : false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (!submissions || submissions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card border border-dashed border-border rounded-2xl p-12 text-center"
      >
        <Home className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">{listView === "requests" ? "لا توجد طلبات للمتابعة" : "لا توجد عقارات معتمدة بعد"}</h3>
        <p className="text-muted-foreground mb-6">
          {listView === "requests"
            ? "لا توجد طلبات قيد المراجعة أو مرفوضة أو تتطلب تعديلاً. العقارات المقبولة تظهر في «إدارة عقاراتي»."
            : planLimits?.freeAccess?.active
            ? "حسابك يتمتع بصلاحية مجانية كاملة."
            : planLimits?.active === false
            ? "جدّد اشتراكك قبل إضافة عقارك الأول."
            : "تظهر العقارات هنا بعد قبولها. لمراجعة الطلبات غير المقبولة، استخدم زر «متابعة الطلبات» أعلى الصفحة."}
        </p>
        {listView === "approved" && planLimits?.active === false && !planLimits?.freeAccess?.active && (
          <Link href="/subscription">
            <Button><Lock className="w-4 h-4 me-2" />جدّد الاشتراك لإضافة عقار</Button>
          </Link>
        )}
      </motion.div>
    );
  }
  return (
    <div className="space-y-4">
      {listView === "approved" && <SectionGuideButton sectionKey="chalets" />}
      {/* Plan limit banner */}
      {planLimits && (
        <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border ${
          atChaletLimit ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40" : "bg-muted/40 border-border"
        }`}>
          <div className="flex items-center gap-2 text-sm">
            {atChaletLimit ? (
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <span className={atChaletLimit ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground"}>
              {toAr(planLimits.chaletCount)} / {planLimits.chaletLimit === 999 ? "∞" : toAr(planLimits.chaletLimit)} عقار
              {atChaletLimit ? " — وصلت الحد الأقصى" : ""}
            </span>
          </div>
          {atChaletLimit && (
            <div className="flex flex-wrap items-center gap-2">
              {planLimits.freeAccess?.active ? (
                <span className="text-xs text-emerald-700 dark:text-emerald-300">صلاحية مجانية كاملة — لا توجد مشتريات مدفوعة مطلوبة</span>
              ) : planLimits.active === false ? (
                <Link href="/subscription">
                  <Button size="sm" variant="default" className="rounded-xl shrink-0 text-xs h-8">
                    <Zap className="w-3.5 h-3.5 me-1" />
                    تجديد الاشتراك
                  </Button>
                </Link>
              ) : (
                <>
                  <Button size="sm" variant="outline" className="rounded-xl shrink-0 text-xs h-8" onClick={() => setShowUpgrade(true)}>
                    <Zap className="w-3.5 h-3.5 me-1" />
                    ترقية الخطة
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <UpgradePlanDialog
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onRequestAddon={onRequestAddon}
        context="chalet"
        active={planLimits?.active}
        extraPrice={planLimits?.extraChaletPrice}
        freeAccess={!!planLimits?.freeAccess?.active}
      />
      <BlockDatesDialog
        open={!!blockTarget}
        chalet={blockTarget}
        onClose={() => setBlockTarget(null)}
        onBlocked={() => qc.invalidateQueries({ queryKey: ["owner", "availability"] })}
        chaletBlocks={blockTarget ? allBlocks.filter((b) => b.chaletId === blockTarget.id) : []}
        onUnblockRange={blockTarget ? (s, e) => handleUnblockRange(blockTarget.id, s, e) : undefined}
      />
      <Dialog open={!!pauseTarget} onOpenChange={(v) => { if (!v) setPauseTarget(null); }}>
        <PauseChaletDialog
          chalet={pauseTarget}
          onClose={() => setPauseTarget(null)}
          onSave={handlePauseChalet}
        />
      </Dialog>
      <EditChaletDialog
        open={!!editTarget}
        sub={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["submissions"] })}
      />
      <ResubmitDialog
        open={!!resubmitTarget}
        sub={resubmitTarget}
        onClose={() => setResubmitTarget(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/api/submissions"] });
          qc.invalidateQueries({ queryKey: ["submissions"] });
        }}
      />
      {submissions.map((sub: any, idx: number) => {
        const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
        const approvedChalet = ownerChalets.find((c: any) => c.submissionId === sub.id);
        const isApproved = sub.status === "approved" && !!approvedChalet;
        const pausedNow = approvedChalet ? isCurrentPause(approvedChalet) : false;
        return (
          <motion.div
            key={sub.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {sub.photos?.[0] ? (
                <img src={sub.photos[0]} alt={sub.nameAr} className="w-full sm:w-28 h-20 object-cover rounded-xl shrink-0" />
              ) : (
                <div className="w-full sm:w-28 h-20 bg-muted rounded-xl shrink-0 flex items-center justify-center">
                  <Home className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-foreground">{sub.nameAr}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${status.className}`}>
                    {status.icon}
                    {status.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {sub.location}{sub.district ? ` - ${sub.district}` : ""}
                  </span>
                  {sub.pricePerNight && Number(sub.pricePerNight) > 0 ? (
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      {toAr(Number(sub.pricePerNight))} ر.س
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      حسب الفترات
                    </span>
                  )}
                  <SubmissionDate value={sub.createdAt} />
                </div>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{sub.descriptionAr}</p>

                {sub.adminNote && (sub.status === "rejected" || sub.status === "needs_revision") && (
                  <div className={`mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3 border ${
                    sub.status === "needs_revision"
                      ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40"
                      : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40"
                  }`}>
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${sub.status === "needs_revision" ? "text-orange-500" : "text-red-500"}`} />
                    <div>
                      <p className={`text-xs font-bold mb-0.5 ${sub.status === "needs_revision" ? "text-orange-700 dark:text-orange-400" : "text-red-700 dark:text-red-400"}`}>
                        {sub.status === "needs_revision" ? "ملاحظات الإدارة — يرجى التعديل والإعادة" : "سبب الرفض"}
                      </p>
                      <p className={`text-xs leading-relaxed ${sub.status === "needs_revision" ? "text-orange-800 dark:text-orange-300" : "text-red-800 dark:text-red-300"}`}>
                        {sub.adminNote}
                      </p>
                    </div>
                  </div>
                )}

                {/* Activity status banner for approved chalets — read-only indicator */}
                {isApproved && (
                  <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 border text-xs ${
                    pausedNow
                      ? "bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800"
                      : approvedChalet.isActive !== false
                        ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40"
                        : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/40"
                  }`}>
                    <span className={`text-base leading-none ${pausedNow ? "text-orange-500" : approvedChalet.isActive !== false ? "text-green-500" : "text-red-500"}`}>
                      {pausedNow ? "⏸" : approvedChalet.isActive !== false ? "●" : "○"}
                    </span>
                    <span className={`font-semibold ${
                      pausedNow
                        ? "text-orange-700 dark:text-orange-300"
                        : approvedChalet.isActive !== false
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                    }`}>
                      حالة النشاط: {approvedChalet.isActive !== false ? (pausedNow ? "متوقف مؤقتاً — مخفي من البحث" : "نشط — ظاهر في البحث") : "غير نشط — مخفي عن الزوار"}
                      {approvedChalet.pausedFrom && (
                        <span className="block mt-0.5 font-normal">
                          الإيقاف: من {formatDualDate(approvedChalet.pausedFrom).hijri.replace(/\s*هـ\s*$/, "")} هـ
                          {approvedChalet.pausedUntil ? ` إلى ${formatDualDate(approvedChalet.pausedUntil).hijri.replace(/\s*هـ\s*$/, "")} هـ` : " بدون تاريخ نهاية"}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Active/upcoming block alert strip */}
                {isApproved && (() => {
                  const chaletBlockRanges = groupBlockedDatesIntoRanges(
                    allBlocks.filter((b) => b.chaletId === approvedChalet.id),
                  );
                  if (!chaletBlockRanges.length) return null;
                  const today = getLocalDateStr();
                  const active = chaletBlockRanges.find((r) => r.startDate <= today && r.endDate >= today);
                  const upcoming = chaletBlockRanges.find((r) => r.startDate > today);
                  const shown = active ?? upcoming;
                  if (!shown) return null;
                  return (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-3 py-2 text-xs">
                      <span className="text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
                        🔒 مغلق ({shown.notes}) — {formatDualDate(shown.startDate).hijri.replace(/\s*هـ\s*$/, "")} هـ إلى {formatDualDate(shown.endDate).hijri}
                        {chaletBlockRanges.length > 1 && (
                          <span className="mr-1 text-gray-500">({toAr(chaletBlockRanges.length)} فترات)</span>
                        )}
                      </span>
                      <button type="button"
                        onClick={() => handleUnblockRange(approvedChalet.id, shown.startDate, shown.endDate)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-400 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-950/20 font-bold transition-colors whitespace-nowrap shrink-0">
                        إعادة فتح 🔓
                      </button>
                    </div>
                  );
                })()}

                {/* Delete confirmation inline */}
                {deleteConfirmId === (approvedChalet?.id ?? -1) && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <span className="flex-1 text-destructive font-medium">هل أنت متأكد من حذف هذا النشاط نهائياً؟</span>
                    <button type="button" disabled={deletingId === approvedChalet?.id}
                      onClick={() => handleDeleteChalet(approvedChalet!.id)}
                      className="px-2.5 py-1 rounded-lg bg-destructive text-destructive-foreground font-bold hover:bg-destructive/90 transition-colors">
                      {deletingId === approvedChalet?.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "حذف نهائي"}
                    </button>
                    <button type="button" onClick={() => setDeleteConfirmId(null)}
                      className="px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors">
                      إلغاء
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                  <Link href={`/my-chalet/${sub.id}`}>
                    <Button size="sm" className="gap-1.5 rounded-xl text-xs h-8">
                      <Eye className="w-3.5 h-3.5" />
                      تفاصيل العقار
                    </Button>
                  </Link>
                  {sub.status === "needs_revision" && (
                    <Link href={`/add-chalet?editId=${sub.id}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 rounded-xl text-xs min-h-8 h-auto py-2">
                        <RotateCcw className="w-3.5 h-3.5" />
                        تعديل وإعادة الإرسال
                      </Button>
                    </Link>
                  )}
                  {sub.status === "rejected" && (
                    <p className="text-xs text-destructive py-2">الطلب مغلق نهائياً ولا يُحتسب ضمن حد الباقة. يمكنك إضافة عقار جديد.</p>
                  )}
                  {isApproved && (
                    <>
                      <Link href={`/chalets/${approvedChalet.id}`} target="_blank">
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-xl text-xs h-8">
                          <ExternalLink className="w-3.5 h-3.5" />
                          معاينة للزبون
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 rounded-xl text-xs h-8 border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                        onClick={() => setBlockTarget({ id: approvedChalet.id, nameAr: sub.nameAr })}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        إغلاق أيام
                      </Button>
                      {pausedNow ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-xl text-xs h-8 border-green-400 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-950/20"
                          onClick={() => handlePauseChalet(approvedChalet.id, null, null, true)}
                          disabled={togglingId === approvedChalet.id}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          تنشيط العقار
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 rounded-xl text-xs h-8 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/20"
                          onClick={() => setPauseTarget({ ...approvedChalet, nameAr: sub.nameAr })}
                        >
                          <PauseCircle className="w-3.5 h-3.5" />
                          إيقاف مؤقت
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 rounded-xl text-xs h-8 border-destructive/40 text-destructive hover:bg-destructive/5"
                        onClick={() => setDeleteConfirmId(deleteConfirmId === approvedChalet.id ? null : approvedChalet.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
