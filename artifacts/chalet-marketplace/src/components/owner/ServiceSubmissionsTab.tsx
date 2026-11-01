import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Trash2, Edit2, Loader2, ExternalLink, Eye, EyeOff, Briefcase, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ServiceSubmissionCard } from "@/components/owner/ServiceSubmissionCard";
import { apiFetch } from "@/components/owner/owner-api";
import { statusConfig } from "@/components/owner/owner-booking-types";


/* ── Service Submissions Tab ─────────────────── */
interface ServiceSubmission {
  id: number;
  businessName: string;
  category: string;
  city: string;
  descriptionAr: string | null;
  logoUrl: string | null;
  galleryPhotos: string[];
  status: string;
  adminNote: string | null;
  createdAt: string;
}

interface ApprovedProvider {
  id: number;
  ownerId: string | null;
  businessName: string;
  category: string;
  city: string;
  isActive: boolean;
  logoUrl: string | null;
  galleryPhotos: string[];
  createdAt: string;
}

export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  bounce_houses: "🎪 نطيطات",
  ice_cream: "🍦 آيس كريم",
  productive_families: "🎀 أسر منتجة",
  catering: "🍽️ تموين وضيافة",
  photography: "📸 تصوير",
  decoration: "🎊 ديكور وتزيين",
  entertainment: "🎶 ترفيه وأناشيد",
  other: "✨ أخرى",
};

export function ServiceSubmissionsTab({
  onManageCalendar,
  onEditProvider,
}: {
  onManageCalendar?: (providerId: number) => void;
  onEditProvider?: (providerId: number) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteProviderConfirmId, setDeleteProviderConfirmId] = useState<number | null>(null);
  const [deletingProviderId, setDeletingProviderId] = useState<number | null>(null);

  const { data: submissions = [], isLoading } = useQuery<ServiceSubmission[]>({
    queryKey: ["my-service-submissions"],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/submissions");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: approvedProviders = [] } = useQuery<ApprovedProvider[]>({
    queryKey: ["my-approved-providers"],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/approved");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const handleDeleteSubmission = async (id: number) => {
    if (!confirm("هل تريد حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setDeletingId(id);
    try {
      const r = await apiFetch(`/providers/my/submissions/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as any;
        toast({ title: "خطأ", description: err.error ?? "فشل الحذف", variant: "destructive" });
      } else {
        queryClient.invalidateQueries({ queryKey: ["my-service-submissions"] });
        toast({ title: "تم الحذف", description: "تم حذف الطلب بنجاح" });
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleProvider = async (provider: ApprovedProvider) => {
    setTogglingId(provider.id);
    try {
      const r = await apiFetch(`/providers/my/approved/${provider.id}/toggle`, { method: "PATCH" });
      if (!r.ok) {
        toast({ title: "خطأ", description: "فشل تغيير الحالة", variant: "destructive" });
      } else {
        queryClient.invalidateQueries({ queryKey: ["my-approved-providers"] });
        const data = await r.json() as { isActive: boolean };
        toast({ title: data.isActive ? "تم التفعيل" : "تم الإيقاف", description: `${provider.businessName} — ${data.isActive ? "ظاهر الآن للعملاء" : "مخفي عن العملاء"}` });
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteProvider = async (provider: ApprovedProvider) => {
    setDeletingProviderId(provider.id);
    try {
      const r = await apiFetch(`/providers/my/approved/${provider.id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as any;
        if (err.hasUpcomingAppointments) {
          toast({ title: "لا يمكن الحذف", description: "يوجد مواعيد قادمة مرتبطة بهذه الخدمة. يرجى إلغاؤها أولاً.", variant: "destructive" });
        } else {
          toast({ title: "خطأ", description: err.error ?? "فشل حذف الخدمة", variant: "destructive" });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ["my-approved-providers"] });
        toast({ title: "تم الحذف", description: "تم حذف الخدمة نهائياً. تبقى السجلات المالية متاحة للاطلاع." });
      }
    } finally {
      setDeletingProviderId(null);
      setDeleteProviderConfirmId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
      </div>
    );
  }

  const hasAny = submissions.length > 0 || approvedProviders.length > 0;

  if (!hasAny) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card border border-dashed border-border rounded-2xl p-12 text-center"
      >
        <Briefcase className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد خدمات بعد</h3>
        <p className="text-muted-foreground">سجّل خدمتك الأولى من زر «إضافة عقار أو خدمة» أعلى الصفحة وابدأ في استقبال الطلبات.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Approved Live Listings ── */}
      {approvedProviders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2 px-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            خدماتك المعتمدة والنشطة
          </h3>
          {approvedProviders.map((p, idx) => {
            const mainPhoto = p.galleryPhotos?.[0] ?? p.logoUrl;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className="bg-card border border-green-200 dark:border-green-800/40 rounded-2xl p-5 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {mainPhoto ? (
                    <img src={mainPhoto} alt={p.businessName} className="w-full sm:w-24 h-18 object-cover rounded-xl shrink-0" />
                  ) : (
                    <div className="w-full sm:w-24 h-18 bg-muted rounded-xl shrink-0 flex items-center justify-center text-3xl">
                      {SERVICE_CATEGORY_LABELS[p.category]?.split(" ")[0] ?? "✨"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-base font-bold text-foreground">{p.businessName}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.isActive ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                        {p.isActive ? "✓ نشط" : "موقوف"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{SERVICE_CATEGORY_LABELS[p.category] ?? p.category} · {p.city}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {p.isActive && (
                      <Button
                        size="sm"
                        variant="default"
                        className="text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={() => onManageCalendar?.(p.id)}
                      >
                        <CalendarDays className="w-3.5 h-3.5" />
                        إدارة التقويم
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      onClick={() => onEditProvider?.(p.id)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      تعديل البيانات
                    </Button>
                    <Link href={`/providers/${p.id}`}>
                      <Button size="sm" variant="outline" className="text-xs gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                        عرض الصفحة
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant={p.isActive ? "outline" : "default"}
                      className="text-xs gap-1.5"
                      disabled={togglingId === p.id}
                      onClick={() => handleToggleProvider(p)}
                    >
                      {togglingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : p.isActive ? (
                        <><EyeOff className="w-3.5 h-3.5" />إيقاف</>
                      ) : (
                        <><Eye className="w-3.5 h-3.5" />تفعيل</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteProviderConfirmId(deleteProviderConfirmId === p.id ? null : p.id)}
                      disabled={deletingProviderId === p.id}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      حذف
                    </Button>
                  </div>
                </div>

                {/* ── Inline delete confirmation ── */}
                {deleteProviderConfirmId === p.id && (
                  <div className="mt-4 border border-destructive/30 rounded-xl bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm font-semibold text-destructive">سيتم حذف الخدمة وكافة بياناتها نهائياً، هل أنت متأكد؟</p>
                    <p className="text-xs text-muted-foreground">لا يمكن الحذف إذا كانت هناك حجوزات قائمة مستقبلية. السجلات المالية التاريخية ستبقى متاحة.</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-xl text-xs gap-1.5"
                        disabled={deletingProviderId === p.id}
                        onClick={() => handleDeleteProvider(p)}
                      >
                        {deletingProviderId === p.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                        تأكيد الحذف
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs"
                        disabled={deletingProviderId === p.id}
                        onClick={() => setDeleteProviderConfirmId(null)}
                      >
                        إلغاء
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Submissions ── */}
      {submissions.length > 0 && (
        <div className="space-y-3">
          {approvedProviders.length > 0 && (
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 px-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              طلبات التسجيل قيد المراجعة
            </h3>
          )}
          {submissions.map((sub, idx) => {
            const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
            return (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
              >
                <ServiceSubmissionCard submission={sub} categoryLabel={SERVICE_CATEGORY_LABELS[sub.category] ?? sub.category}
                  status={status} deleting={deletingId === sub.id} onDelete={() => handleDeleteSubmission(sub.id)} />
              </motion.div>
            );
          })}
        </div>
      )}

    </div>
  );
}
