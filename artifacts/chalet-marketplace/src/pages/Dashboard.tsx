import { useEffect, useState, useMemo, type ReactElement } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  User, LogOut, Plus, MapPin, Calendar, Clock, CheckCircle,
  XCircle, Home, BookOpen, Trash2, Building2, Globe, Phone, AlertTriangle,
  RotateCcw, Star, ChevronLeft, ChevronRight, BarChart2, CreditCard,
  TrendingUp, Sunrise, Moon, Sun, Lock, Zap,
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
  pending:        { label: "قيد المراجعة",  icon: <Clock className="w-3.5 h-3.5" />,       className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved:       { label: "تمت الموافقة",  icon: <CheckCircle className="w-3.5 h-3.5" />,  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected:       { label: "مرفوض",         icon: <XCircle className="w-3.5 h-3.5" />,      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  needs_revision: { label: "يحتاج تعديل",  icon: <RotateCcw className="w-3.5 h-3.5" />,    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
};

interface OwnerBooking {
  id: number;
  submissionId?: number | null;
  clientName: string;
  bookingDate: string;
  durationDays: number;
  source: "platform" | "external";
  notes?: string | null;
  period?: string | null;
  createdAt: string;
}

interface ChaletAvailability {
  id: number;
  chaletId: number;
  dateStr: string;
  periodMorning: boolean;
  periodEvening: boolean;
  periodFullDay: boolean;
  notes: string | null;
}

/* ── Upgrade Popup + Chalets Tab ─────────────── */
const TIER_PLANS = [
  {
    key: "chalet_basic",
    name: "أساسي - شاليهات",
    price: "99 ر.س / شهر",
    chaletLimit: 1,
    serviceLimit: 0,
    features: ["شاليه واحد", "تقارير أساسية", "دعم عبر واتساب"],
    highlight: false,
  },
  {
    key: "chalet_pro",
    name: "احترافي - شاليهات",
    price: "199 ر.س / شهر",
    chaletLimit: 5,
    serviceLimit: 0,
    features: ["حتى 5 شاليهات", "تقارير تفصيلية", "أولوية في الدعم"],
    highlight: true,
  },
  {
    key: "chalet_unlimited",
    name: "غير محدود - شاليهات",
    price: "349 ر.س / شهر",
    chaletLimit: 999,
    serviceLimit: 0,
    features: ["شاليهات غير محدودة", "تقارير شهرية واتساب", "مدير حساب خاص"],
    highlight: false,
  },
  {
    key: "bundle",
    name: "باقة شاملة",
    price: "499 ر.س / شهر",
    chaletLimit: 999,
    serviceLimit: 999,
    features: ["شاليهات + خدمات غير محدودة", "تقارير متقدمة", "أولوية قصوى"],
    highlight: false,
  },
];

function UpgradePlanDialog({ open, onClose, context }: { open: boolean; onClose: () => void; context: "chalet" | "service" }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            ترقية الخطة
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {context === "chalet"
              ? "لقد وصلت إلى الحد الأقصى من الشاليهات في خطتك الحالية. اختر خطة أعلى للاستمرار."
              : "لقد وصلت إلى الحد الأقصى من الخدمات. اختر خطة أعلى للاستمرار."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {TIER_PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl border p-4 flex flex-col gap-3 ${
                plan.highlight
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlight && (
                <span className="text-xs font-bold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full self-start">الأكثر طلباً</span>
              )}
              <div>
                <p className="font-bold text-foreground text-sm">{plan.name}</p>
                <p className="text-lg font-extrabold text-primary mt-0.5">{plan.price}</p>
              </div>
              <ul className="space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant={plan.highlight ? "default" : "outline"}
                className="mt-auto w-full rounded-xl"
                onClick={() => {
                  const msg = `أريد الترقية إلى خطة: ${plan.name} (${plan.price})`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                }}
              >
                اختر هذه الخطة
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">سيتم التواصل معك عبر واتساب لإتمام الاشتراك</p>
      </DialogContent>
    </Dialog>
  );
}

function ChaletsTab({ submissions, isLoading }: { submissions: any[] | undefined; isLoading: boolean }) {
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data: planLimits } = useQuery<{ plan: string; chaletLimit: number; chaletCount: number; serviceLimit: number }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", chaletLimit: 1, chaletCount: 0, serviceLimit: 1 };
      return r.json();
    },
  });

  const atChaletLimit = planLimits
    ? (submissions?.length ?? 0) >= planLimits.chaletLimit
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
              {submissions.length} / {planLimits.chaletLimit === 999 ? "∞" : planLimits.chaletLimit} شاليه
              {atChaletLimit ? " — وصلت الحد الأقصى" : ""}
            </span>
          </div>
          {atChaletLimit && (
            <Button size="sm" variant="default" className="rounded-xl shrink-0 text-xs h-8" onClick={() => setShowUpgrade(true)}>
              <Zap className="w-3.5 h-3.5 me-1" />
              ترقية الخطة
            </Button>
          )}
        </div>
      )}
      <UpgradePlanDialog open={showUpgrade} onClose={() => setShowUpgrade(false)} context="chalet" />
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
  const [period, setPeriod] = useState<string>("");
  const [source, setSource] = useState<"platform" | "external">("external");
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
          period: period && period !== "none" ? period : undefined,
          source,
          notes: notes || undefined,
          submissionId: submissionId ? Number(submissionId) : undefined,
        }),
      });
      if (!r.ok) { setError("حدث خطأ، يرجى المحاولة مجدداً"); return; }
      onAdded();
      onClose();
      setClientName(""); setBookingDate(""); setDurationDays(1); setPeriod(""); setSource("external"); setSubmissionId(""); setNotes("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">إضافة حجز يدوي خارجي</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">لتسجيل حجوزات قادمة من واتساب أو انستقرام أو أي مصدر خارج المنصة</p>
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
            <label className="text-sm font-semibold">الفترة الزمنية (اختياري)</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="morning">🌅 صباحي</SelectItem>
                <SelectItem value="evening">🌙 مسائي</SelectItem>
                <SelectItem value="full_day">☀️ يوم كامل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">مصدر الحجز</label>
            <Select value={source} onValueChange={(v) => setSource(v as "platform" | "external")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">من خارج المنصة (واتساب / انستقرام)</SelectItem>
                <SelectItem value="platform">عن طريق المنصة</SelectItem>
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

/* ── Block Date Dialog ───────────────────────── */
function BlockDateDialog({
  open, onClose, dateStr, chaletId, existing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dateStr: string;
  chaletId: number;
  existing?: ChaletAvailability | null;
  onSaved: () => void;
}) {
  const [morning, setMorning] = useState(existing?.periodMorning ?? false);
  const [evening, setEvening] = useState(existing?.periodEvening ?? false);
  const [fullDay, setFullDay] = useState(existing?.periodFullDay ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMorning(existing?.periodMorning ?? false);
    setEvening(existing?.periodEvening ?? false);
    setFullDay(existing?.periodFullDay ?? false);
    setNotes(existing?.notes ?? "");
  }, [existing, open]);

  const handleSave = async () => {
    if (!morning && !evening && !fullDay) {
      if (existing) {
        await apiFetch(`/owner/availability/${existing.id}`, { method: "DELETE" });
      }
      onSaved(); onClose(); return;
    }
    setSaving(true);
    try {
      await apiFetch("/owner/availability", {
        method: "POST",
        body: JSON.stringify({ chaletId, dateStr, periodMorning: morning, periodEvening: evening, periodFullDay: fullDay, notes: notes || undefined }),
      });
      onSaved(); onClose();
    } finally {
      setSaving(false);
    }
  };

  const labelDate = new Date(dateStr + "T12:00:00").toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-right text-base font-bold">ضبط إتاحة اليوم</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <p className="text-sm text-muted-foreground">{labelDate}</p>
          <p className="text-xs text-foreground font-medium">حدد الفترات المحجوزة (غير المتاحة):</p>
          <div className="space-y-3">
            {[
              { key: "morning" as const,  label: "🌅 صباحي",     state: morning,  set: setMorning },
              { key: "evening" as const,  label: "🌙 مسائي",     state: evening,  set: setEvening },
              { key: "full_day" as const, label: "☀️ يوم كامل",  state: fullDay,  set: setFullDay },
            ].map(({ label, state, set }) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => set(!state)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                    state ? "bg-destructive border-destructive" : "border-border group-hover:border-destructive/50"
                  }`}
                >
                  {state && <XCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm font-medium">{label} — محجوز</span>
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">ملاحظة (اختياري)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: حفلة عائلية" className="text-sm" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
          {!morning && !evening && !fullDay && existing && (
            <p className="text-xs text-center text-muted-foreground">إلغاء تحديد جميع الفترات سيحذف تاريخ الحجب.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Mini Calendar ───────────────────────────── */
function MiniCalendar({
  year, month, availability, onDateClick,
}: {
  year: number;
  month: number;
  availability: ChaletAvailability[];
  onDateClick: (dateStr: string) => void;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const arabicDays = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

  const availMap = useMemo(() => {
    const m = new Map<string, ChaletAvailability>();
    for (const a of availability) m.set(a.dateStr, a);
    return m;
  }, [availability]);

  const today = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 gap-px mb-1">
        {arabicDays.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry = availMap.get(dateStr);
          const isBlocked = entry && (entry.periodMorning || entry.periodEvening || entry.periodFullDay);
          const isPartial = entry && !entry.periodFullDay && (entry.periodMorning || entry.periodEvening);
          const isToday = dateStr === today;

          return (
            <button
              key={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={`relative aspect-square rounded-lg text-xs font-medium transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                isBlocked
                  ? isPartial
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  : "hover:bg-primary/10 text-foreground"
              } ${isToday ? "ring-2 ring-primary font-bold" : ""}`}
            >
              {day}
              {isBlocked && (
                <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isPartial ? "bg-amber-500" : "bg-red-500"}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Booking Calendar Tab ────────────────────── */
function BookingCalendarTab({ submissions }: { submissions: any[] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedChaletId, setSelectedChaletId] = useState<number | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [blockDateStr, setBlockDateStr] = useState<string | null>(null);

  const { data: ownerChalets = [], isLoading: chaletsLoading } = useQuery<any[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const activeChaletId = selectedChaletId ?? ownerChalets[0]?.id ?? null;

  const { data: availability = [], isLoading: availLoading } = useQuery<ChaletAvailability[]>({
    queryKey: ["owner", "availability", activeChaletId],
    queryFn: async () => {
      if (!activeChaletId) return [];
      const r = await apiFetch(`/owner/availability?chaletId=${activeChaletId}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeChaletId,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<OwnerBooking[]>({
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

  const calAvailability = useMemo(() => {
    return availability.filter((a) => {
      const [y, m] = a.dateStr.split("-").map(Number);
      return y === calYear && m === calMonth;
    });
  }, [availability, calYear, calMonth]);

  const blockEntry = blockDateStr ? availability.find((a) => a.dateStr === blockDateStr) ?? null : null;

  const monthLabel = new Date(calYear, calMonth - 1, 1).toLocaleDateString("ar-SA", { year: "numeric", month: "long" });

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
    else setCalMonth(m => m + 1);
  };

  const noApprovedChalets = !chaletsLoading && ownerChalets.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">سجل وتقويم الحجوزات</h2>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="w-4 h-4 me-2" />
          إضافة حجز يدوي
        </Button>
      </div>

      <AddBookingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        submissions={submissions}
        onAdded={() => qc.invalidateQueries({ queryKey: ["owner", "bookings"] })}
      />

      {/* Calendar Section */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <h3 className="font-bold text-foreground flex-1">التقويم والإتاحة</h3>
          {ownerChalets.length > 1 && (
            <Select
              value={String(activeChaletId ?? "")}
              onValueChange={(v) => setSelectedChaletId(Number(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="اختر الشاليه" />
              </SelectTrigger>
              <SelectContent>
                {ownerChalets.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {noApprovedChalets ? (
          <div className="text-center py-8">
            <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا يوجد شاليه معتمد بعد. بعد موافقة الإدارة سيظهر التقويم هنا.</p>
          </div>
        ) : (
          <>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold">{monthLabel}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {availLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <MiniCalendar
                year={calYear}
                month={calMonth}
                availability={calAvailability}
                onDateClick={(ds) => {
                  if (!activeChaletId) return;
                  setBlockDateStr(ds);
                }}
              />
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 inline-block" />محجوز بالكامل</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 inline-block" />محجوز جزئياً</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-muted inline-block" />متاح</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">انقر على أي تاريخ لضبط الفترات المحجوزة.</p>
          </>
        )}
      </div>

      {/* Bookings List */}
      <div>
        <h3 className="font-bold text-foreground mb-4">قائمة الحجوزات</h3>
        {bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-base font-semibold mb-2">لا توجد حجوزات بعد</h3>
            <p className="text-sm text-muted-foreground mb-4">سجّل حجوزاتك من واتساب وانستقرام لمتابعة تقويمك</p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 me-2" />
              إضافة أول حجز
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
                      {b.source === "platform" ? "المنصة" : "خارجي"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {b.bookingDate}
                    </span>
                    <span>{b.durationDays} {b.durationDays === 1 ? "يوم" : "أيام"}</span>
                    {b.period && (
                      <span className="text-xs font-medium bg-primary/8 text-primary px-1.5 py-0.5 rounded">
                        {{ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[b.period as string] ?? b.period}
                      </span>
                    )}
                  </div>
                  {b.notes && <p className="text-xs text-muted-foreground mt-1">{b.notes}</p>}
                </div>
                <button
                  onClick={() => deleteBooking.mutate(b.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1"
                  aria-label="حذف الحجز"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Block Date Dialog */}
      {blockDateStr && activeChaletId && (
        <BlockDateDialog
          open={!!blockDateStr}
          onClose={() => setBlockDateStr(null)}
          dateStr={blockDateStr}
          chaletId={activeChaletId}
          existing={blockEntry}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["owner", "availability", activeChaletId] });
            setBlockDateStr(null);
          }}
        />
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
                    <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{sub.city}</span>
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
interface MonthReport {
  month: string;
  totalBookings: number;
  platformBookings: number;
  externalBookings: number;
  totalDays: number;
  daysInMonth: number;
  occupancyRate: number;
  slotStats: { morning: number; evening: number; full_day: number; unspecified: number };
  topSlot: string;
  topSlotLabel: string;
}

function ReportsTab() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("all");

  const { data: mySubmissions = [] } = useQuery<any[]>({
    queryKey: ["my-submissions-for-report"],
    queryFn: async () => {
      const r = await apiFetch("/submissions/mine");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: report, isLoading } = useQuery<MonthReport>({
    queryKey: ["owner", "reports", selectedMonth, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams({ month: selectedMonth });
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/reports?${params}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const { data: subscription } = useQuery({
    queryKey: ["owner", "subscription"],
    queryFn: async () => {
      const r = await apiFetch("/owner/subscription");
      if (!r.ok) return null;
      return r.json();
    },
  });

  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
      opts.push({ val, label });
    }
    return opts;
  }, []);

  const slotLabels: Record<string, { icon: ReactElement; label: string }> = {
    morning:     { icon: <Sunrise className="w-4 h-4" />,  label: "صباحي" },
    evening:     { icon: <Moon className="w-4 h-4" />,     label: "مسائي" },
    full_day:    { icon: <Sun className="w-4 h-4" />,      label: "يوم كامل" },
    unspecified: { icon: <Clock className="w-4 h-4" />,    label: "غير محدد" },
  };

  const handleShareWhatsApp = () => {
    if (!report || !subscription) return;
    const text = `📊 تقرير شهر ${report.month}\n\n` +
      `📅 إجمالي الحجوزات: ${report.totalBookings}\n` +
      `📈 نسبة الإشغال: ${report.occupancyRate}%\n` +
      `🏆 الفترة الأكثر طلباً: ${report.topSlotLabel}\n` +
      `🔗 المنصة: ${report.platformBookings} | خارجي: ${report.externalBookings}\n\n` +
      `شاليهات القصيم — اشتراك نشط (بدون عمولة)`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const planLabels: Record<string, string> = {
    trial: "تجريبي (30 يوم)",
    monthly: "شهري",
    yearly: "سنوي",
  };
  const statusLabels: Record<string, { label: string; className: string }> = {
    active:   { label: "نشط", className: "bg-green-100 text-green-700" },
    expired:  { label: "منتهي", className: "bg-red-100 text-red-700" },
    pending:  { label: "قيد التفعيل", className: "bg-amber-100 text-amber-700" },
  };

  return (
    <div className="space-y-6">
      {/* Subscription Card */}
      {subscription && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">الاشتراك والخطة</p>
              <p className="text-xs text-muted-foreground">نموذج بدون عمولة — سعر ثابت فقط</p>
            </div>
            <span className={`ms-auto text-xs font-semibold px-3 py-1 rounded-full ${statusLabels[subscription.status]?.className ?? "bg-muted text-muted-foreground"}`}>
              {statusLabels[subscription.status]?.label ?? subscription.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">الخطة الحالية</p>
              <p className="font-semibold">{planLabels[subscription.plan] ?? subscription.plan}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">تاريخ الانتهاء</p>
              <p className="font-semibold">
                {subscription.expiresAt
                  ? new Date(subscription.expiresAt).toLocaleDateString("ar-SA")
                  : "—"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">حالة الدفع</p>
              <p className={`font-semibold ${subscription.paymentStatus === "paid" ? "text-green-600" : subscription.paymentStatus === "overdue" ? "text-red-600" : "text-amber-600"}`}>
                {{paid: "مدفوع ✓", pending: "قيد الدفع", overdue: "متأخر!"}[subscription.paymentStatus as string] ?? subscription.paymentStatus}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Report Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          فلاتر التقرير
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Property filter */}
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground font-medium">العقار</label>
            <Select value={selectedSubmissionId} onValueChange={setSelectedSubmissionId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="كل العقارات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العقارات</SelectItem>
                {mySubmissions.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nameAr ?? `شاليه #${s.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Month filter */}
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground font-medium">الشهر</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.val} value={o.val}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {selectedSubmissionId !== "all" && (
          <p className="text-xs text-primary font-medium flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            يعرض بيانات: {mySubmissions.find((s: any) => String(s.id) === selectedSubmissionId)?.nameAr ?? `شاليه #${selectedSubmissionId}`}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !report ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
          <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">لا توجد بيانات لهذا الشهر</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "إجمالي الحجوزات", value: report.totalBookings, icon: <BookOpen className="w-5 h-5" />, color: "bg-primary/10 text-primary" },
              { label: "نسبة الإشغال", value: `${report.occupancyRate}%`, icon: <TrendingUp className="w-5 h-5" />, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
              { label: "عبر المنصة", value: report.platformBookings, icon: <Globe className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
              { label: "من خارج المنصة", value: report.externalBookings, icon: <Phone className="w-5 h-5" />, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Occupancy bar */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground text-sm">نسبة الإشغال — {monthOptions.find(o => o.val === selectedMonth)?.label}</h3>
              <span className="text-2xl font-bold text-primary">{report.occupancyRate}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-500"
                style={{ width: `${report.occupancyRate}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{report.totalDays} يوم محجوز من أصل {report.daysInMonth} يوم</p>
          </div>

          {/* Slot breakdown */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold text-foreground mb-4 text-sm">توزيع الفترات الزمنية</h3>
            <div className="space-y-3">
              {(["morning", "evening", "full_day"] as const).map((key) => {
                const count = report.slotStats[key];
                const total = report.totalBookings || 1;
                const pct = Math.round((count / total) * 100);
                const { icon, label } = slotLabels[key];
                const isTop = key === report.topSlot;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {icon} {label}
                        {isTop && count > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">الأعلى</span>}
                      </span>
                      <span className="font-semibold">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${isTop && count > 0 ? "bg-primary" : "bg-muted-foreground/40"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Share Report */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleShareWhatsApp} className="gap-2">
              <span>📤</span>
              مشاركة التقرير عبر واتساب
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────── */
export default function Dashboard() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"chalets" | "services" | "calendar" | "reports">("chalets");
  const [showHeaderUpgrade, setShowHeaderUpgrade] = useState<"chalet" | "service" | null>(null);
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { data: submissions, isLoading: submissionsLoading } = useGetMySubmissions();

  const { data: planLimits } = useQuery<{ plan: string; chaletLimit: number; chaletCount: number; serviceLimit: number }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", chaletLimit: 1, chaletCount: 0, serviceLimit: 1 };
      return r.json();
    },
    enabled: isAuthenticated,
  });

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
    { id: "chalets",   label: "شاليهاتي",         icon: <Building2 className="w-4 h-4" /> },
    { id: "services",  label: "خدماتي",            icon: <Star className="w-4 h-4" /> },
    { id: "calendar",  label: "التقويم والحجوزات", icon: <Calendar className="w-4 h-4" /> },
    { id: "reports",   label: "التقارير",          icon: <BarChart2 className="w-4 h-4" /> },
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
              أهلاً، {user?.firstName ?? "عزيزنا"} 👋
            </h1>
            <p className="text-muted-foreground mt-1">لوحة تحكمك الموحدة — الشاليهات والخدمات في مكان واحد</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {planLimits && (submissions?.length ?? 0) >= planLimits.chaletLimit ? (
              <Button variant="outline" className="rounded-xl font-semibold text-sm" onClick={() => setShowHeaderUpgrade("chalet")}>
                <Lock className="w-4 h-4 me-1.5 text-amber-500" />
                إضافة شاليه
              </Button>
            ) : (
              <Link href="/add-chalet">
                <Button variant="outline" className="rounded-xl font-semibold text-sm">
                  <Plus className="w-4 h-4 me-1.5" />
                  إضافة شاليه
                </Button>
              </Link>
            )}
            <Link href="/add-service-provider">
              <Button className="rounded-xl font-semibold text-sm">
                <Plus className="w-4 h-4 me-1.5" />
                إضافة خدمة
              </Button>
            </Link>
            <Button variant="ghost" onClick={logout} className="rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive text-sm px-3">
              <LogOut className="w-4 h-4 me-1.5" />
              خروج
            </Button>
          </div>
        </motion.div>
        <UpgradePlanDialog
          open={showHeaderUpgrade !== null}
          onClose={() => setShowHeaderUpgrade(null)}
          context={showHeaderUpgrade ?? "chalet"}
        />

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto pb-0 -mx-1 px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
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
        {activeTab === "calendar" && (
          <BookingCalendarTab submissions={submissions as any[] ?? []} />
        )}
        {activeTab === "reports" && (
          <ReportsTab />
        )}
      </div>
    </div>
  );
}
