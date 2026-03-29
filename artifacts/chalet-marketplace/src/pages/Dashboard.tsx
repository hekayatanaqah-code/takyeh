import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMySubmissions } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  User, LogOut, Plus, MapPin, Calendar, Clock, CheckCircle,
  XCircle, Home, BookOpen, BarChart2, Trash2, Building2, Globe, Phone, AlertTriangle, RotateCcw, Star,
} from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
}

const statusConfig = {
  pending:        { label: "قيد المراجعة",    icon: <Clock className="w-3.5 h-3.5" />,        className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved:       { label: "تمت الموافقة",    icon: <CheckCircle className="w-3.5 h-3.5" />,   className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected:       { label: "مرفوض",           icon: <XCircle className="w-3.5 h-3.5" />,       className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  needs_revision: { label: "يحتاج تعديل",    icon: <RotateCcw className="w-3.5 h-3.5" />,     className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
};

/* ── Types ───────────────────────────────────── */
interface OwnerBooking {
  id: number;
  submissionId?: number | null;
  clientName: string;
  bookingDate: string;
  durationDays: number;
  source: "platform" | "external";
  notes?: string | null;
  createdAt: string;
}

/* ── Chalets Tab ─────────────────────────────── */
function ChaletsTab({ submissions, isLoading }: { submissions: any[] | undefined; isLoading: boolean }) {
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
        <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد شاليهات بعد</h3>
        <p className="text-muted-foreground mb-6">ابدأ بإضافة شاليهك الأول للمراجعة والنشر</p>
        <Link href="/add-chalet">
          <Button>
            <Plus className="w-4 h-4 me-2" />
            إضافة شاليه جديد
          </Button>
        </Link>
      </motion.div>
    );
  }
  return (
    <div className="space-y-4">
      {submissions.map((sub: any, idx: number) => {
        const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
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
                  {sub.createdAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(sub.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{sub.descriptionAr}</p>

                {/* Admin note notification */}
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
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Add Booking Dialog ──────────────────────── */
function AddBookingDialog({
  open, onClose, submissions, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  submissions: any[];
  onAdded: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [source, setSource] = useState<"platform" | "external">("platform");
  const [submissionId, setSubmissionId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !bookingDate) { setError("يرجى ملء الحقول المطلوبة"); return; }
    setSaving(true); setError("");
    try {
      const r = await apiFetch("/owner/bookings", {
        method: "POST",
        body: JSON.stringify({
          clientName,
          bookingDate,
          durationDays,
          source,
          notes: notes || undefined,
          submissionId: submissionId ? Number(submissionId) : undefined,
        }),
      });
      if (!r.ok) { setError("حدث خطأ، يرجى المحاولة مجدداً"); return; }
      onAdded();
      onClose();
      setClientName(""); setBookingDate(""); setDurationDays(1); setSource("platform"); setSubmissionId(""); setNotes("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">إضافة حجز جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">اسم العميل *</label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">تاريخ الحجز *</label>
            <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">عدد الأيام</label>
            <Input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">مصدر الحجز</label>
            <Select value={source} onValueChange={(v) => setSource(v as "platform" | "external")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">عن طريق المنصة</SelectItem>
                <SelectItem value="external">من خارج المنصة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {submissions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">الشاليه (اختياري)</label>
              <Select value={submissionId} onValueChange={setSubmissionId}>
                <SelectTrigger><SelectValue placeholder="اختر الشاليه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {submissions.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">ملاحظات (اختياري)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ الحجز"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Bookings Tab ────────────────────────────── */
function BookingsTab({ submissions }: { submissions: any[] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: bookings = [], isLoading } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const deleteBooking = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "bookings"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">سجل الحجوزات</h2>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="w-4 h-4 me-2" />
          إضافة حجز
        </Button>
      </div>

      <AddBookingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        submissions={submissions}
        onAdded={() => qc.invalidateQueries({ queryKey: ["owner", "bookings"] })}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">لا توجد حجوزات بعد</h3>
          <p className="text-muted-foreground mb-4">أضف حجوزاتك يدوياً لمتابعة أداء شاليهك</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 me-2" />
            إضافة حجز
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {b.source === "platform" ? <Globe className="w-5 h-5 text-primary" /> : <Phone className="w-5 h-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">{b.clientName}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.source === "platform" ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700"}`}>
                    {b.source === "platform" ? "عن طريق المنصة" : "خارج المنصة"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {b.bookingDate}
                  </span>
                  <span>{b.durationDays} {b.durationDays === 1 ? "يوم" : "أيام"}</span>
                </div>
                {b.notes && <p className="text-xs text-muted-foreground mt-1">{b.notes}</p>}
              </div>
              <button
                onClick={() => deleteBooking.mutate(b.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label="حذف الحجز"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

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

const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  bounce_houses: "🎪 نطيطات",
  ice_cream: "🍦 آيس كريم",
  productive_families: "🎀 أسر منتجة",
  catering: "🍽️ تموين وضيافة",
  photography: "📸 تصوير",
  decoration: "🎊 ديكور وتزيين",
  entertainment: "🎶 ترفيه وأناشيد",
  other: "✨ أخرى",
};

function ServiceSubmissionsTab() {
  const { data: submissions = [], isLoading } = useQuery<ServiceSubmission[]>({
    queryKey: ["my-service-submissions"],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/submissions");
      if (!r.ok) return [];
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card border border-dashed border-border rounded-2xl p-12 text-center"
      >
        <Star className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد خدمات مسجلة بعد</h3>
        <p className="text-muted-foreground mb-6">سجّل خدمتك لتظهر لعملاء في منطقة القصيم</p>
        <Link href="/add-service-provider">
          <Button>
            <Plus className="w-4 h-4 me-2" />
            تسجيل خدمة جديدة
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub, idx) => {
        const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
        const mainPhoto = sub.galleryPhotos?.[0] ?? sub.logoUrl;
        return (
          <motion.div
            key={sub.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {mainPhoto ? (
                <img src={mainPhoto} alt={sub.businessName} className="w-full sm:w-28 h-20 object-cover rounded-xl shrink-0" />
              ) : (
                <div className="w-full sm:w-28 h-20 bg-muted rounded-xl shrink-0 flex items-center justify-center text-3xl">
                  {SERVICE_CATEGORY_LABELS[sub.category]?.split(" ")[0] ?? "✨"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-foreground">{sub.businessName}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${status.className}`}>
                    {status.icon}{status.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-muted-foreground">
                  <span>{SERVICE_CATEGORY_LABELS[sub.category] ?? sub.category}</span>
                  {sub.city && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />{sub.city}
                    </span>
                  )}
                  {sub.createdAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(sub.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                  )}
                </div>
                {sub.descriptionAr && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{sub.descriptionAr}</p>
                )}
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
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Reports Tab ─────────────────────────────── */
function ReportsTab() {
  const { data: bookings = [], isLoading } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const total = bookings.length;
  const platform = bookings.filter((b) => b.source === "platform").length;
  const external = bookings.filter((b) => b.source === "external").length;
  const totalDays = bookings.reduce((acc, b) => acc + b.durationDays, 0);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyBookings = bookings.filter((b) => b.bookingDate.startsWith(thisMonth)).length;

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-foreground">تقرير الأداء</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الحجوزات", value: total, icon: <BookOpen className="w-5 h-5" />, color: "bg-primary/10 text-primary" },
          { label: "حجوزات هذا الشهر", value: monthlyBookings, icon: <Calendar className="w-5 h-5" />, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
          { label: "عبر المنصة", value: platform, icon: <Globe className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
          { label: "من خارج المنصة", value: external, icon: <Phone className="w-5 h-5" />, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color}`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-bold text-foreground mb-4">توزيع المصادر</h3>
        {total === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد بيانات كافية بعد</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>عبر المنصة</span>
                <span className="font-semibold">{total ? Math.round((platform / total) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${total ? (platform / total) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>خارج المنصة</span>
                <span className="font-semibold">{total ? Math.round((external / total) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${total ? (external / total) * 100 : 0}%` }} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">إجمالي الأيام المحجوزة: <span className="font-semibold text-foreground">{totalDays} يوم</span></p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────── */
export default function Dashboard() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"chalets" | "services" | "bookings" | "reports">("chalets");
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { data: submissions, isLoading: submissionsLoading } = useGetMySubmissions();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const tabs = [
    { id: "chalets",  label: "شاليهاتي",    icon: <Building2 className="w-4 h-4" /> },
    { id: "services", label: "خدماتي",      icon: <Star className="w-4 h-4" /> },
    { id: "bookings", label: "حجوزاتنا",    icon: <BookOpen className="w-4 h-4" /> },
    { id: "reports",  label: "التقارير",    icon: <BarChart2 className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Owner Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-3xl p-6 md:p-8 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt={user.firstName ?? ""} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground">
              أهلاً، {user?.firstName ?? "مالك الشاليه"} 👋
            </h1>
            <p className="text-muted-foreground mt-1">مرحباً بك في لوحة تحكم ملاك الشاليهات</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/add-chalet">
              <Button className="rounded-xl font-semibold">
                <Plus className="w-4 h-4 me-2" />
                إضافة شاليه
              </Button>
            </Link>
            <Button variant="outline" onClick={logout} className="rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive">
              <LogOut className="w-4 h-4 me-2" />
              تسجيل خروج
            </Button>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-border overflow-x-auto pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "chalets" && (
          <ChaletsTab submissions={submissions as any[]} isLoading={submissionsLoading} />
        )}
        {activeTab === "services" && (
          <ServiceSubmissionsTab />
        )}
        {activeTab === "bookings" && (
          <BookingsTab submissions={submissions as any[] ?? []} />
        )}
        {activeTab === "reports" && (
          <ReportsTab />
        )}
      </div>
    </div>
  );
}
