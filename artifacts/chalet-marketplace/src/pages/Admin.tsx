import { useState, useEffect, useRef } from "react";
import { formatDualDate } from "@/lib/hijri";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2, CheckCircle, XCircle, MapPin, Settings, Users, Tag, Building2, Wrench, Plus, Edit2, Phone, Eye, Calendar, ShieldCheck, ShieldOff, ExternalLink, Instagram, AlertTriangle, RotateCcw, Home, DoorOpen, Star, Image as ImageIcon, ChevronLeft, ChevronRight, GripVertical, ToggleLeft, ToggleRight, CreditCard, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

/* ── Domain types ─────────────────────────────── */
type ServiceCategory = "bounce_houses" | "ice_cream" | "productive_families";

interface Submission {
  id: number;
  nameAr: string;
  location: string;
  district?: string | null;
  whatsappNumber: string;
  pricePerNight: string;
  status: string;
  createdAt: string;
  trialEndsAt?: string | null;
  mapsUrl?: string | null;
  websiteUrl?: string | null;
  socialLink?: string | null;
  descriptionAr?: string | null;
  amenities?: string[];
  photos?: string[];
  propertyType?: string | null;
  sections?: string | null;
  adminNote?: string | null;
}

interface AdminChalet {
  id: number;
  nameAr: string;
  location: string;
  district?: string | null;
  category?: string | null;
  isVerified: boolean;
  whatsappNumber: string;
  createdAt: string;
}

interface City {
  id: number;
  name: string;
  isActive: boolean;
}

interface District {
  id: number;
  name: string;
  cityId: number;
  isActive: boolean;
}

interface Amenity {
  id: number;
  key: string;
  labelAr: string;
  isActive: boolean;
}

interface Owner {
  ownerId: string;
  nameAr: string;
  whatsappNumber: string;
  createdAt: string;
}

interface Service {
  id: number;
  nameAr: string;
  category: ServiceCategory;
  descriptionAr: string;
  whatsappNumber: string;
  price: string | null;
  priceNote: string | null;
  city: string | null;
  isActive: boolean;
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
}

/* ── Status Badge ─────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:        { label: "قيد الانتظار",    className: "bg-amber-100 text-amber-800 border-amber-200" },
    approved:       { label: "مقبول",           className: "bg-green-100 text-green-800 border-green-200" },
    rejected:       { label: "مرفوض",           className: "bg-red-100 text-red-800 border-red-200" },
    needs_revision: { label: "يحتاج تعديل",    className: "bg-orange-100 text-orange-800 border-orange-200" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.className}`}>{s.label}</span>;
}

/* ── Submission Review Modal ──────────────────── */
function SubmissionReviewModal({
  submission,
  open,
  onClose,
  onDecision,
  isPending,
}: {
  submission: Submission | null;
  open: boolean;
  onClose: () => void;
  onDecision: (id: number, status: string, adminNote?: string) => void;
  isPending: boolean;
}) {
  const [pendingAction, setPendingAction] = useState<"approved" | "rejected" | "needs_revision" | null>(null);
  const [reason, setReason] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const resetAction = () => { setPendingAction(null); setReason(""); };

  const handleClose = () => { resetAction(); onClose(); };

  const handleDecision = () => {
    if (!submission || !pendingAction) return;
    const note = pendingAction !== "approved" ? reason.trim() : undefined;
    onDecision(submission.id, pendingAction, note);
    handleClose();
  };

  if (!submission) return null;
  const s = submission;

  const actionConfig = {
    approved:       { label: "تأكيد القبول",         className: "bg-green-700 hover:bg-green-600 text-white" },
    rejected:       { label: "تأكيد الرفض",          className: "bg-red-700 hover:bg-red-600 text-white" },
    needs_revision: { label: "تأكيد الإرجاع للتعديل", className: "bg-orange-700 hover:bg-orange-600 text-white" },
  };

  const needsReason = pendingAction === "rejected" || pendingAction === "needs_revision";
  const canConfirm = !isPending && (pendingAction === "approved" || (needsReason && reason.trim().length > 0));

  return (
    <>
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="صورة مكبّرة" className="max-w-full max-h-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="bg-slate-900 border-slate-700 text-white max-w-3xl p-0 flex flex-col"
          style={{ maxHeight: "92vh" }}
          dir="rtl"
        >
          {/* ── Sticky Header ───────────────────────────── */}
          <div className="shrink-0 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-6 py-4">
            <h2 className="text-xl font-bold text-white leading-tight">{s.nameAr}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={s.status} />
              {s.createdAt && (
                <span className="text-slate-400 text-xs">
                  {new Date(s.createdAt).toLocaleDateString("ar-SA")}
                </span>
              )}
              {s.pricePerNight && (
                <span className="text-amber-400 text-xs font-semibold">
                  {Number(s.pricePerNight).toLocaleString("ar-SA")} ر.س / ليلة
                </span>
              )}
            </div>
          </div>

          {/* ── Scrollable Body ──────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">

            {/* ── Photo Gallery ── */}
            <div>
              <p className="text-slate-300 text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-amber-500 rounded-full shrink-0" />
                الصور المرفوعة {s.photos && s.photos.length > 0 ? `(${s.photos.length})` : ""}
              </p>
              {s.photos && s.photos.length > 0 ? (
                <div className={`grid gap-2 ${s.photos.length === 1 ? "grid-cols-1" : s.photos.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {s.photos.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setLightboxUrl(url)}
                      className="relative group overflow-hidden rounded-xl border border-slate-700 hover:border-amber-500/60 transition-colors cursor-zoom-in"
                    >
                      <img
                        src={url}
                        alt={`صورة ${i + 1}`}
                        className="w-full h-40 object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 rounded-xl border border-dashed border-slate-700 text-slate-500 text-sm">
                  لم يتم رفع أي صور
                </div>
              )}
            </div>

            {/* ── Full Info Grid ── */}
            <div>
              <p className="text-slate-300 text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-amber-500 rounded-full shrink-0" />
                المعلومات الأساسية
              </p>
              <div className="grid grid-cols-2 gap-3 bg-slate-800/60 rounded-xl p-4 text-sm">
                {/* City / District */}
                <div className="space-y-0.5">
                  <p className="text-slate-400 text-xs">المدينة / الحي</p>
                  <p className="text-white font-medium">
                    {s.location}
                    {s.district ? <span className="text-slate-400"> — {s.district}</span> : ""}
                  </p>
                </div>
                {/* WhatsApp */}
                <div className="space-y-0.5">
                  <p className="text-slate-400 text-xs">رقم واتساب</p>
                  <p className="text-white font-mono" dir="ltr">{s.whatsappNumber}</p>
                </div>
                {/* Property Type */}
                <div className="space-y-0.5">
                  <p className="text-slate-400 text-xs">نوع العقار</p>
                  {s.propertyType
                    ? <p className="text-amber-400 font-semibold">{s.propertyType}</p>
                    : <p className="text-slate-600">—</p>
                  }
                </div>
                {/* Sections */}
                <div className="space-y-0.5">
                  <p className="text-slate-400 text-xs">عدد الأقسام</p>
                  {s.sections
                    ? <p className="text-amber-400 font-semibold">{s.sections}</p>
                    : <p className="text-slate-600">—</p>
                  }
                </div>
                {/* Maps URL */}
                <div className="col-span-2 space-y-0.5">
                  <p className="text-slate-400 text-xs">رابط الخريطة</p>
                  {s.mapsUrl ? (
                    <a href={s.mapsUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-medium">
                      <MapPin className="w-3.5 h-3.5" />
                      عرض الموقع على خرائط قوقل
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <p className="text-slate-600 text-xs">لم يتم إدخال رابط</p>
                  )}
                </div>
                {/* Trial ends */}
                {s.trialEndsAt && (
                  <div className="col-span-2 space-y-0.5">
                    <p className="text-slate-400 text-xs">انتهاء الفترة التجريبية</p>
                    {(() => {
                      const d = formatDualDate(s.trialEndsAt!.split("T")[0]);
                      return (
                        <p className="text-amber-400 font-medium">
                          {d.gregorian}
                          <span className="text-amber-600 text-xs mr-2">({d.hijri})</span>
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* ── Social Link Verification ── */}
            <div>
              <p className="text-slate-300 text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-amber-500 rounded-full shrink-0" />
                التحقق من هوية المالك
              </p>
              {s.socialLink ? (
                <div className="bg-pink-950/40 border border-pink-800/50 rounded-xl p-4 flex items-start gap-3">
                  <div className="w-9 h-9 bg-pink-900/60 rounded-lg flex items-center justify-center shrink-0">
                    <Instagram className="w-5 h-5 text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-pink-300 font-bold text-sm mb-0.5">يجب التحقق قبل الموافقة</p>
                    <p className="text-slate-400 text-xs mb-2 break-all">{s.socialLink}</p>
                    <a
                      href={s.socialLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 bg-pink-900/40 hover:bg-pink-900/70 border border-pink-700/40 text-pink-300 hover:text-pink-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      فتح الحساب الاجتماعي
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3 text-slate-500 text-sm">
                  <Instagram className="w-4 h-4 shrink-0" />
                  لم يتم تقديم رابط تواصل اجتماعي
                </div>
              )}
            </div>

            {/* ── Description ── */}
            <div>
              <p className="text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-amber-500 rounded-full shrink-0" />
                وصف العقار
              </p>
              {s.descriptionAr ? (
                <p className="text-slate-200 text-sm leading-relaxed bg-slate-800/60 rounded-xl p-4 border border-slate-700">
                  {s.descriptionAr}
                </p>
              ) : (
                <p className="text-slate-600 text-sm bg-slate-800/40 rounded-xl p-4 border border-slate-700">لا يوجد وصف</p>
              )}
            </div>

            {/* ── Amenities ── */}
            <div>
              <p className="text-slate-300 text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-amber-500 rounded-full shrink-0" />
                المرافق والمميزات {s.amenities && s.amenities.length > 0 ? `(${s.amenities.length})` : ""}
              </p>
              {s.amenities && s.amenities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {s.amenities.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 text-xs bg-slate-700/80 text-slate-200 border border-slate-600 px-2.5 py-1 rounded-full">
                      <CheckCircle className="w-3 h-3 text-green-400" />
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-600 text-sm">لم يتم اختيار أي مرافق</p>
              )}
            </div>

            {/* ── Previous admin note ── */}
            {s.adminNote && (
              <div className="bg-orange-950/40 border border-orange-700/50 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-orange-300 text-sm font-bold mb-1">ملاحظة الإدارة السابقة</p>
                  <p className="text-slate-300 text-sm">{s.adminNote}</p>
                </div>
              </div>
            )}

            {/* ── Reason input (shown when a reject/revision action is pending) ── */}
            {pendingAction && needsReason && (
              <div className="bg-slate-800/80 border border-slate-600 rounded-xl p-4 space-y-2">
                <label className="text-slate-300 text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  {pendingAction === "needs_revision"
                    ? "سبب الإرجاع للتعديل (مطلوب — سيُعرض للمالك)"
                    : "سبب الرفض (مطلوب — سيُعرض للمالك)"}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={pendingAction === "needs_revision"
                    ? "مثال: الصور غير واضحة، يرجى رفع صور بجودة أعلى..."
                    : "مثال: المعلومات المقدمة غير مكتملة..."}
                  rows={3}
                  autoFocus
                  className="w-full bg-slate-900 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                />
              </div>
            )}
          </div>

          {/* ── Sticky Bottom Action Bar ──────────────────── */}
          <div className="shrink-0 border-t border-slate-700 bg-slate-900/95 backdrop-blur px-6 py-4">
            {!pendingAction ? (
              <div className="flex gap-3">
                {/* Approve — always show, disable if already approved */}
                <Button
                  className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setPendingAction("approved")}
                  disabled={isPending || s.status === "approved"}
                  title={s.status === "approved" ? "الطلب مقبول بالفعل" : undefined}
                >
                  <CheckCircle className="w-4 h-4 ml-2" />
                  {s.status === "approved" ? "مقبول بالفعل ✓" : "قبول الطلب"}
                </Button>
                {/* Revision */}
                <Button
                  className="flex-1 bg-orange-700 hover:bg-orange-600 text-white font-bold text-sm py-2.5"
                  onClick={() => setPendingAction("needs_revision")}
                  disabled={isPending}
                >
                  <RotateCcw className="w-4 h-4 ml-2" />
                  إرجاع للتعديل
                </Button>
                {/* Reject */}
                <Button
                  variant="destructive"
                  className="flex-1 font-bold text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setPendingAction("rejected")}
                  disabled={isPending || s.status === "rejected"}
                  title={s.status === "rejected" ? "الطلب مرفوض بالفعل" : undefined}
                >
                  <XCircle className="w-4 h-4 ml-2" />
                  {s.status === "rejected" ? "مرفوض بالفعل" : "رفض الطلب"}
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetAction}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
                >
                  ← إلغاء
                </button>
                <Button
                  className={`flex-1 text-sm font-bold py-2.5 ${actionConfig[pendingAction].className}`}
                  onClick={handleDecision}
                  disabled={!canConfirm}
                >
                  {isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                  {actionConfig[pendingAction].label}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Submissions Tab ──────────────────────────── */
function SubmissionsTab() {
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["admin", "submissions"],
    queryFn: async () => {
      const r = await apiFetch("/admin/submissions");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      const r = await apiFetch(`/admin/submissions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote }),
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "submissions"] }),
  });

  const deleteSubmission = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/submissions/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  return (
    <>
      <SubmissionReviewModal
        submission={reviewSubmission}
        open={reviewSubmission !== null}
        onClose={() => setReviewSubmission(null)}
        onDecision={(id, status, adminNote) => updateStatus.mutate({ id, status, adminNote })}
        isPending={updateStatus.isPending}
      />

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="text-slate-300 text-right font-semibold">اسم الشاليه</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الموقع</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">واتساب</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">السعر</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الحالة</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">التجربة تنتهي</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">التاريخ</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-400 py-12">لا توجد طلبات بعد</TableCell>
              </TableRow>
            )}
            {submissions.map((s: Submission) => (
              <TableRow key={s.id} className="border-slate-700 hover:bg-slate-800/50 transition-colors">
                <TableCell className="font-semibold text-white">{s.nameAr}</TableCell>
                <TableCell className="text-slate-300">
                  {s.location}
                  {s.district && <span className="block text-xs text-slate-500">{s.district}</span>}
                </TableCell>
                <TableCell className="text-slate-300 font-mono text-sm" dir="ltr">{s.whatsappNumber}</TableCell>
                <TableCell className="text-slate-300">{Number(s.pricePerNight).toLocaleString("ar-SA")} ر.س</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-slate-400 text-sm">
                  {s.trialEndsAt ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(s.trialEndsAt).toLocaleDateString("ar-SA")}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-400 text-sm">{new Date(s.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30"
                      onClick={() => setReviewSubmission(s)}
                      title="مراجعة"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {s.status !== "approved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-900/30"
                        onClick={() => updateStatus.mutate({ id: s.id, status: "approved" })}
                        disabled={updateStatus.isPending}
                        title="قبول"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {s.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                        onClick={() => setReviewSubmission(s)}
                        title="رفض (افتح المراجعة)"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {s.mapsUrl && (
                      <a href={s.mapsUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-400 transition-colors">
                        <MapPin className="w-4 h-4" />
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                      onClick={() => setDeleteId(s.id)}
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذا الطلب نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteSubmission.mutate(deleteId)}
            >
              {deleteSubmission.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Locations Tab ────────────────────────────── */
function LocationsTab() {
  const qc = useQueryClient();
  const [newCity, setNewCity] = useState("");
  const [newDistrict, setNewDistrict] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [deleteDialog, setDeleteDialog] = useState<{ type: "city" | "district"; id: number } | null>(null);

  const { data: cities = [] } = useQuery({
    queryKey: ["admin", "cities"],
    queryFn: async () => {
      const r = await apiFetch("/admin/cities");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const { data: districts = [] } = useQuery({
    queryKey: ["admin", "districts"],
    queryFn: async () => {
      const r = await apiFetch("/admin/districts");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const addCity = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiFetch("/admin/cities", { method: "POST", body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
      setNewCity("");
      qc.invalidateQueries({ queryKey: ["admin", "cities"] });
    },
  });

  const addDistrict = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/admin/districts", {
        method: "POST",
        body: JSON.stringify({ name: newDistrict, cityId: Number(selectedCityId) }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
      setNewDistrict("");
      qc.invalidateQueries({ queryKey: ["admin", "districts"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async ({ type, id }: { type: "city" | "district"; id: number }) => {
      const path = type === "city" ? `/admin/cities/${id}` : `/admin/districts/${id}`;
      const r = await apiFetch(path, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteDialog(null);
      qc.invalidateQueries({ queryKey: ["admin", "cities"] });
      qc.invalidateQueries({ queryKey: ["admin", "districts"] });
    },
  });

  const cityDistricts = districts.filter((d: District) => d.cityId === Number(selectedCityId));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Cities */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 className="text-white font-bold mb-4 text-lg">المدن</h3>
        <div className="flex gap-2 mb-4">
          <Input
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            placeholder="اسم المدينة"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
            onKeyDown={(e) => e.key === "Enter" && newCity.trim() && addCity.mutate(newCity.trim())}
          />
          <Button
            onClick={() => newCity.trim() && addCity.mutate(newCity.trim())}
            disabled={!newCity.trim() || addCity.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {addCity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
          </Button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {cities.map((city: City) => (
            <div key={city.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700">
              <span className="text-white font-medium">{city.name}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${city.isActive ? "bg-green-900/50 text-green-400" : "bg-slate-700 text-slate-400"}`}>
                  {city.isActive ? "مفعّل" : "مخفي"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                  onClick={() => setDeleteDialog({ type: "city", id: city.id })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {cities.length === 0 && <p className="text-slate-500 text-center py-4">لا توجد مدن بعد</p>}
        </div>
      </div>

      {/* Districts */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 className="text-white font-bold mb-4 text-lg">الأحياء</h3>
        <div className="space-y-2 mb-4">
          <Select value={selectedCityId} onValueChange={setSelectedCityId}>
            <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
              <SelectValue placeholder="اختر المدينة" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {cities.map((city: City) => (
                <SelectItem key={city.id} value={String(city.id)} className="text-white focus:bg-slate-700">{city.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              value={newDistrict}
              onChange={(e) => setNewDistrict(e.target.value)}
              placeholder="اسم الحي"
              className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
              disabled={!selectedCityId}
            />
            <Button
              onClick={() => addDistrict.mutate()}
              disabled={!newDistrict.trim() || !selectedCityId || addDistrict.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              {addDistrict.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
            </Button>
          </div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {selectedCityId && cityDistricts.map((d: District) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700">
              <span className="text-white">{d.name}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                onClick={() => setDeleteDialog({ type: "district", id: d.id })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {!selectedCityId && <p className="text-slate-500 text-center py-4">اختر مدينة لعرض أحيائها</p>}
          {selectedCityId && cityDistricts.length === 0 && <p className="text-slate-500 text-center py-4">لا توجد أحياء لهذه المدينة</p>}
        </div>
      </div>

      <AlertDialog open={deleteDialog !== null} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذا العنصر نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteDialog && deleteItem.mutate(deleteDialog)}
            >
              {deleteItem.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Amenities Tab ────────────────────────────── */
function AmenitiesTab() {
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: amenities = [] } = useQuery({
    queryKey: ["admin", "amenities"],
    queryFn: async () => {
      const r = await apiFetch("/admin/amenities");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const addAmenity = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/admin/amenities", {
        method: "POST",
        body: JSON.stringify({ key: newKey.trim(), labelAr: newLabel.trim() }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
      setNewKey("");
      setNewLabel("");
      qc.invalidateQueries({ queryKey: ["admin", "amenities"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/amenities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "amenities"] }),
  });

  const deleteAmenity = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/amenities/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "amenities"] });
    },
  });

  return (
    <>
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 mb-6">
        <h3 className="text-white font-bold mb-4">إضافة ميزة جديدة</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="المفتاح (بالإنجليزية، مثل: wifi)"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
            dir="ltr"
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="الاسم بالعربية (مثل: واي فاي)"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
          />
          <Button
            onClick={() => addAmenity.mutate()}
            disabled={!newKey.trim() || !newLabel.trim() || addAmenity.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {addAmenity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="text-slate-300 text-right">المفتاح</TableHead>
              <TableHead className="text-slate-300 text-right">الاسم بالعربية</TableHead>
              <TableHead className="text-slate-300 text-right">الحالة</TableHead>
              <TableHead className="text-slate-300 text-right">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {amenities.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-12">لا توجد مرافق بعد</TableCell>
              </TableRow>
            )}
            {amenities.map((a: Amenity) => (
              <TableRow key={a.id} className="border-slate-700 hover:bg-slate-800/50">
                <TableCell className="font-mono text-sm text-slate-400" dir="ltr">{a.key}</TableCell>
                <TableCell className="text-white font-medium">{a.labelAr}</TableCell>
                <TableCell>
                  <button
                    onClick={() => toggleActive.mutate({ id: a.id, isActive: !a.isActive })}
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                      a.isActive
                        ? "bg-green-900/50 text-green-400 hover:bg-green-900"
                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                  >
                    {a.isActive ? "مفعّل" : "مخفي"}
                  </button>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-slate-400 hover:text-red-400"
                    onClick={() => setDeleteId(a.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذه الميزة نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteAmenity.mutate(deleteId)}
            >
              {deleteAmenity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Owners Tab ───────────────────────────────── */
function OwnersTab() {
  const { data: owners = [], isLoading } = useQuery({
    queryKey: ["admin", "owners"],
    queryFn: async () => {
      const r = await apiFetch("/admin/owners");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700 bg-slate-800">
            <TableHead className="text-slate-300 text-right">معرف المالك</TableHead>
            <TableHead className="text-slate-300 text-right">اسم الشاليه الأول</TableHead>
            <TableHead className="text-slate-300 text-right">واتساب</TableHead>
            <TableHead className="text-slate-300 text-right">تاريخ الانضمام</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {owners.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-slate-400 py-12">لا يوجد ملاك بعد</TableCell>
            </TableRow>
          )}
          {owners.map((owner: Owner) => (
            <TableRow key={owner.ownerId} className="border-slate-700 hover:bg-slate-800/50">
              <TableCell className="font-mono text-xs text-slate-400 max-w-[150px] truncate" dir="ltr">{owner.ownerId}</TableCell>
              <TableCell className="text-white font-medium">{owner.nameAr}</TableCell>
              <TableCell className="text-slate-300 font-mono text-sm" dir="ltr">{owner.whatsappNumber}</TableCell>
              <TableCell className="text-slate-400 text-sm">{new Date(owner.createdAt).toLocaleDateString("ar-SA")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Services Tab ─────────────────────────────── */
const SERVICE_CATEGORIES = [
  { value: "bounce_houses",       label: "نطيطات",      emoji: "🎪" },
  { value: "ice_cream",           label: "آيس كريم",    emoji: "🍦" },
  { value: "productive_families", label: "أسر منتجة",  emoji: "🎀" },
] as const;

interface ServiceFormData {
  nameAr: string;
  category: ServiceCategory;
  descriptionAr: string;
  whatsappNumber: string;
  price: string;
  priceNote: string;
  city: string;
}

const BLANK_SERVICE: ServiceFormData = {
  nameAr: "", category: "bounce_houses", descriptionAr: "",
  whatsappNumber: "", price: "", priceNote: "", city: "",
};

function ServicesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ServiceFormData>(BLANK_SERVICE);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["admin", "services"],
    queryFn: async () => {
      const r = await apiFetch("/admin/services");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const saveService = useMutation({
    mutationFn: async () => {
      const payload = {
        nameAr: form.nameAr,
        category: form.category,
        descriptionAr: form.descriptionAr,
        whatsappNumber: form.whatsappNumber,
        price: form.price ? Number(form.price) : undefined,
        priceNote: form.priceNote || undefined,
        city: form.city || undefined,
      };
      const url = editId ? `/admin/services/${editId}` : "/admin/services";
      const method = editId ? "PATCH" : "POST";
      const r = await apiFetch(url, { method, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("فشل الحفظ");
    },
    onSuccess: () => {
      setShowForm(false);
      setEditId(null);
      setForm(BLANK_SERVICE);
      qc.invalidateQueries({ queryKey: ["admin", "services"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
  });

  const deleteService = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/services/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "services"] });
    },
  });

  const handleEdit = (svc: Service) => {
    setEditId(svc.id);
    setForm({
      nameAr: svc.nameAr,
      category: svc.category,
      descriptionAr: svc.descriptionAr,
      whatsappNumber: svc.whatsappNumber,
      price: svc.price ?? "",
      priceNote: svc.priceNote ?? "",
      city: svc.city ?? "",
    });
    setShowForm(true);
  };

  return (
    <>
      {/* Add/Edit Form */}
      {showForm ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <h3 className="text-white font-bold text-lg mb-5">
            {editId ? "تعديل الخدمة" : "إضافة خدمة جديدة"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">اسم الخدمة *</label>
              <Input
                value={form.nameAr}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                placeholder="مثال: نطاطة كبيرة للأطفال"
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">الفئة *</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as ServiceCategory }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-white focus:bg-slate-700">
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">رقم الواتساب *</label>
              <Input
                value={form.whatsappNumber}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                placeholder="966501234567"
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">المدينة</label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="بريدة"
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 px-3 py-2">
                <p className="text-[#25D366] text-sm font-semibold">الأسعار عند التواصل مع المالك</p>
                <p className="text-slate-400 text-xs mt-0.5">سيتواصل العملاء مع مزود الخدمة مباشرةً للاستفسار</p>
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-slate-300 text-sm font-medium">وصف الخدمة *</label>
              <Textarea
                value={form.descriptionAr}
                onChange={(e) => setForm((f) => ({ ...f, descriptionAr: e.target.value }))}
                placeholder="اكتب تفاصيل الخدمة: المميزات، الأبعاد، ما يشمله العرض..."
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400 min-h-[100px] resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-5 justify-end">
            <Button
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => { setShowForm(false); setEditId(null); setForm(BLANK_SERVICE); }}
            >
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => saveService.mutate()}
              disabled={!form.nameAr || !form.descriptionAr || !form.whatsappNumber || saveService.isPending}
            >
              {saveService.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : (editId ? "حفظ التعديلات" : "إضافة الخدمة")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => setShowForm(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Plus className="w-4 h-4 me-1.5" />
            إضافة خدمة
          </Button>
        </div>
      )}

      {/* Services Table */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>
      ) : (
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 bg-slate-800">
                <TableHead className="text-slate-300 text-right">الخدمة</TableHead>
                <TableHead className="text-slate-300 text-right">الفئة</TableHead>
                <TableHead className="text-slate-300 text-right">المدينة</TableHead>
                <TableHead className="text-slate-300 text-right">السعر</TableHead>
                <TableHead className="text-slate-300 text-right">الحالة</TableHead>
                <TableHead className="text-slate-300 text-right">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-12">
                    لا توجد خدمات — اضغط "إضافة خدمة" للبدء
                  </TableCell>
                </TableRow>
              )}
              {services.map((svc: Service) => {
                const cat = SERVICE_CATEGORIES.find((c) => c.value === svc.category);
                return (
                  <TableRow key={svc.id} className="border-slate-700 hover:bg-slate-800/50">
                    <TableCell>
                      <div className="font-semibold text-white">{svc.nameAr}</div>
                      <div className="text-slate-400 text-xs mt-0.5 line-clamp-1">{svc.descriptionAr}</div>
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {cat ? `${cat.emoji} ${cat.label}` : svc.category}
                    </TableCell>
                    <TableCell className="text-slate-300">{svc.city ?? "—"}</TableCell>
                    <TableCell className="text-slate-300">
                      {svc.price
                        ? `${Number(svc.price).toLocaleString("ar-SA")} ر.س`
                        : svc.priceNote ?? "بالاتفاق"}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleActive.mutate({ id: svc.id, isActive: !svc.isActive })}
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                          svc.isActive
                            ? "bg-green-900/50 text-green-400 hover:bg-green-900"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
                      >
                        {svc.isActive ? "مفعّل" : "مخفي"}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 px-2 text-slate-400 hover:text-amber-400"
                          onClick={() => handleEdit(svc)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <a
                          href={`https://wa.me/${svc.whatsappNumber.replace(/\D/g, "")}`}
                          target="_blank" rel="noreferrer"
                          className="text-slate-400 hover:text-green-400 transition-colors p-2"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 px-2 text-slate-400 hover:text-red-400"
                          onClick={() => setDeleteId(svc.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذه الخدمة نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteService.mutate(deleteId)}
            >
              {deleteService.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Categories Tab ───────────────────────────── */
function CategoriesTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  interface Category { id: number; nameAr: string; isActive: boolean }

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/categories");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const addCategory = useMutation({
    mutationFn: async (nameAr: string) => {
      const r = await apiFetch("/admin/categories", { method: "POST", body: JSON.stringify({ nameAr }) });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => { setNewName(""); qc.invalidateQueries({ queryKey: ["admin", "categories"] }); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/categories/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => { setDeleteId(null); qc.invalidateQueries({ queryKey: ["admin", "categories"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-4">إضافة فئة جديدة</h3>
        <div className="flex gap-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثال: شالية، مزرعة، استراحة"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) addCategory.mutate(newName.trim()); }}
          />
          <Button
            onClick={() => newName.trim() && addCategory.mutate(newName.trim())}
            disabled={addCategory.isPending || !newName.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            <Plus className="w-4 h-4 me-1" />
            إضافة
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>
      ) : categories.length === 0 ? (
        <p className="text-slate-400 text-center py-10">لا توجد فئات بعد</p>
      ) : (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 bg-slate-800">
                <TableHead className="text-slate-300 text-right">اسم الفئة</TableHead>
                <TableHead className="text-slate-300 text-right">الحالة</TableHead>
                <TableHead className="text-slate-300 text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id} className="border-slate-700 hover:bg-slate-800/50">
                  <TableCell className="text-white font-medium">{cat.nameAr}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive.mutate({ id: cat.id, isActive: !cat.isActive })}
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cat.isActive ? "bg-green-900/50 text-green-400" : "bg-slate-700 text-slate-400"}`}
                    >
                      {cat.isActive ? "مفعّل" : "مخفي"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-400 hover:text-red-400" onClick={() => setDeleteId(cat.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">سيتم حذف هذه الفئة نهائياً.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteId && deleteCategory.mutate(deleteId)}>
              {deleteCategory.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Service Categories Tab ───────────────────── */
interface ServiceCat {
  id: number;
  key: string;
  labelAr: string;
  emoji: string;
  isActive: boolean;
  sortOrder: number;
}

function ServiceCategoriesTab() {
  const qc = useQueryClient();

  const [items, setItems] = useState<ServiceCat[]>([]);
  const [isDirtyOrder, setIsDirtyOrder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const [newForm, setNewForm] = useState({ key: "", labelAr: "", emoji: "✨" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ labelAr: "", emoji: "" });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteLabel, setDeleteLabel] = useState("");
  const [deleteIsOther, setDeleteIsOther] = useState(false);

  const dragSrc = useRef<number | null>(null);

  const { data: catData, isLoading } = useQuery<ServiceCat[]>({
    queryKey: ["admin", "service-categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/service-categories");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  useEffect(() => {
    if (catData) { setItems(catData); setIsDirtyOrder(false); }
  }, [catData]);

  const addCategory = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/admin/service-categories", {
        method: "POST",
        body: JSON.stringify({
          key: newForm.key.trim().toLowerCase().replace(/\s+/g, "_"),
          labelAr: newForm.labelAr.trim(),
          emoji: newForm.emoji.trim() || "✨",
          sortOrder: items.length,
        }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
      return r.json();
    },
    onSuccess: () => {
      setNewForm({ key: "", labelAr: "", emoji: "✨" });
      qc.invalidateQueries({ queryKey: ["admin", "service-categories"] });
      qc.invalidateQueries({ queryKey: ["catalog", "service-categories"] });
    },
  });

  const patchCategory = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<ServiceCat> }) => {
      const r = await apiFetch(`/admin/service-categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => {
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["admin", "service-categories"] });
      qc.invalidateQueries({ queryKey: ["catalog", "service-categories"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/service-categories/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "service-categories"] });
      qc.invalidateQueries({ queryKey: ["catalog", "service-categories"] });
    },
  });

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      await apiFetch("/admin/service-categories/reorder", {
        method: "PATCH",
        body: JSON.stringify(items.map((c, i) => ({ id: c.id, sortOrder: i }))),
      });
      setIsDirtyOrder(false);
      qc.invalidateQueries({ queryKey: ["admin", "service-categories"] });
      qc.invalidateQueries({ queryKey: ["catalog", "service-categories"] });
    } finally {
      setSavingOrder(false);
    }
  };

  const handleToggle = (cat: ServiceCat) => {
    setItems((prev) => prev.map((c) => c.id === cat.id ? { ...c, isActive: !c.isActive } : c));
    patchCategory.mutate({ id: cat.id, patch: { isActive: !cat.isActive } });
  };

  const startEdit = (cat: ServiceCat) => {
    setEditId(cat.id);
    setEditForm({ labelAr: cat.labelAr, emoji: cat.emoji });
  };

  const confirmEdit = () => {
    if (!editId) return;
    patchCategory.mutate({ id: editId, patch: { labelAr: editForm.labelAr, emoji: editForm.emoji } });
  };

  /* ── Drag-and-drop ── */
  const onDragStart = (idx: number) => { dragSrc.current = idx; };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const src = dragSrc.current;
    if (src === null || src === idx) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(src, 1);
      next.splice(idx, 0, moved);
      dragSrc.current = idx;
      return next;
    });
    setIsDirtyOrder(true);
  };
  const onDragEnd = () => { dragSrc.current = null; };

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">فئات الخدمات</h2>
          <p className="text-slate-400 text-sm mt-0.5">تُعرض في قائمة «فئة الخدمة» عند تسجيل مزود خدمة</p>
        </div>
        {isDirtyOrder && (
          <Button
            onClick={saveOrder}
            disabled={savingOrder}
            className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
          >
            {savingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : "💾 حفظ الترتيب"}
          </Button>
        )}
      </div>

      {/* ── Add Form ── */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
        <h3 className="text-slate-200 font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-amber-400" />
          إضافة فئة جديدة
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">الإيموجي</label>
            <Input
              value={newForm.emoji}
              onChange={(e) => setNewForm((f) => ({ ...f, emoji: e.target.value }))}
              placeholder="✨"
              className="bg-slate-900 border-slate-600 text-white text-center text-xl w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">الاسم بالعربية *</label>
            <Input
              value={newForm.labelAr}
              onChange={(e) => setNewForm((f) => ({ ...f, labelAr: e.target.value }))}
              placeholder="مثال: تصوير، ديكور..."
              className="bg-slate-900 border-slate-600 text-white placeholder-slate-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">المفتاح (بالإنجليزية) *</label>
            <Input
              value={newForm.key}
              onChange={(e) => setNewForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="مثال: photography"
              className="bg-slate-900 border-slate-600 text-white placeholder-slate-500 font-mono"
              dir="ltr"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button
            onClick={() => addCategory.mutate()}
            disabled={!newForm.key.trim() || !newForm.labelAr.trim() || addCategory.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
          >
            {addCategory.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Plus className="w-4 h-4 me-1.5" />}
            إضافة الفئة
          </Button>
        </div>
        {addCategory.isError && (
          <p className="text-red-400 text-sm mt-2">فشل الإضافة — قد يكون المفتاح مستخدماً بالفعل.</p>
        )}
      </div>

      {/* ── Hint ── */}
      <div className="bg-blue-950/40 border border-blue-800/40 rounded-xl px-4 py-3 text-blue-300 text-sm flex items-start gap-2.5">
        <GripVertical className="w-4 h-4 shrink-0 mt-0.5" />
        <span>اسحب الصف من مقبض <strong>⠿</strong> لإعادة الترتيب، ثم اضغط <strong>«حفظ الترتيب»</strong>. حذف فئة سينقل مزوديها تلقائياً إلى «أخرى».</span>
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>لا توجد فئات بعد — أضف أولى الفئات أعلاه</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((cat, idx) => (
            <div
              key={cat.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDragEnd={onDragEnd}
              className={`bg-slate-800 border rounded-2xl transition-all ${
                cat.isActive
                  ? "border-slate-700 hover:border-amber-500/40"
                  : "border-slate-700/50 opacity-60"
              }`}
            >
              {editId === cat.id ? (
                /* ── Edit Row ── */
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <GripVertical className="w-5 h-5 text-slate-600 shrink-0 cursor-grab" />
                  <Input
                    value={editForm.emoji}
                    onChange={(e) => setEditForm((f) => ({ ...f, emoji: e.target.value }))}
                    className="w-16 text-center text-xl bg-slate-900 border-slate-600 text-white"
                  />
                  <Input
                    value={editForm.labelAr}
                    onChange={(e) => setEditForm((f) => ({ ...f, labelAr: e.target.value }))}
                    className="flex-1 min-w-[140px] bg-slate-900 border-slate-600 text-white"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditId(null); }}
                  />
                  <span className="font-mono text-xs text-slate-500 bg-slate-900/60 px-2 py-1 rounded border border-slate-700">{cat.key}</span>
                  <Button
                    size="sm"
                    onClick={confirmEdit}
                    disabled={patchCategory.isPending || !editForm.labelAr.trim()}
                    className="bg-green-700 hover:bg-green-600 text-white"
                  >
                    {patchCategory.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="text-slate-400 hover:text-white">
                    إلغاء
                  </Button>
                </div>
              ) : (
                /* ── View Row ── */
                <div className="p-4 flex items-center gap-3">
                  {/* Drag handle */}
                  <div
                    className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors shrink-0"
                    title="اسحب لإعادة الترتيب"
                  >
                    <GripVertical className="w-5 h-5" />
                  </div>

                  {/* Emoji */}
                  <span className="text-2xl shrink-0 w-9 text-center leading-none">{cat.emoji}</span>

                  {/* Label + key */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{cat.labelAr}</p>
                    <p className="text-slate-500 text-xs font-mono">{cat.key}</p>
                  </div>

                  {/* Active badge */}
                  <button
                    onClick={() => handleToggle(cat)}
                    className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
                      cat.isActive
                        ? "bg-green-900/50 text-green-400 hover:bg-green-900 border border-green-800/40"
                        : "bg-slate-700 text-slate-400 hover:bg-slate-600 border border-slate-600"
                    }`}
                    title={cat.isActive ? "انقر لتعطيل الفئة" : "انقر لتفعيل الفئة"}
                  >
                    {cat.isActive
                      ? <><ToggleRight className="w-3.5 h-3.5" />مفعّل</>
                      : <><ToggleLeft className="w-3.5 h-3.5" />مخفي</>
                    }
                  </button>

                  {/* Edit */}
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => startEdit(cat)}
                    className="text-slate-400 hover:text-amber-400 shrink-0 h-8 w-8 p-0"
                    title="تعديل"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>

                  {/* Delete */}
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      setDeleteId(cat.id);
                      setDeleteLabel(cat.labelAr);
                      setDeleteIsOther(cat.key === "other");
                    }}
                    className="text-slate-400 hover:text-red-400 shrink-0 h-8 w-8 p-0"
                    title="حذف"
                    disabled={cat.key === "other"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              تأكيد حذف الفئة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300 text-right leading-relaxed">
              سيتم حذف الفئة <strong className="text-white">«{deleteLabel}»</strong> نهائياً.
              {!deleteIsOther && (
                <span className="block mt-2 p-3 bg-amber-950/50 border border-amber-700/40 rounded-xl text-amber-300 text-sm">
                  ⚠️ جميع مزودي الخدمة المسجلين ضمن هذه الفئة سيُنقلون تلقائياً إلى فئة <strong>«أخرى»</strong>.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteCategory.mutate(deleteId)}
            >
              {deleteCategory.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف نهائياً"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Site Settings Tab ────────────────────────── */
function SettingsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const settingFields = [
    { key: "platform_whatsapp",  label: "رقم واتساب المنصة (بدون +)",     placeholder: "966500000000",            isLtr: true,     isTextarea: false },
    { key: "whatsapp_message",   label: "نص الرسالة التلقائية للواتساب",   placeholder: "مرحباً، أود الاستفسار...", isLtr: false,    isTextarea: true  },
    { key: "platform_email",     label: "البريد الإلكتروني للتواصل",       placeholder: "info@example.com",        isLtr: true,     isTextarea: false },
    { key: "instagram_url",      label: "رابط إنستقرام",                   placeholder: "https://instagram.com/...", isLtr: true,   isTextarea: false },
    { key: "twitter_url",        label: "رابط تويتر/X",                    placeholder: "https://x.com/...",       isLtr: true,     isTextarea: false },
  ];

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const r = await apiFetch("/admin/settings");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const r = await apiFetch("/admin/settings", { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل الحفظ");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const pageContentFields = [
    { key: "about_page_content",  label: "محتوى صفحة «من نحن»",       icon: "ℹ️", path: "/about" },
    { key: "faq_page_content",    label: "محتوى صفحة «أسئلة شائعة»",  icon: "❓", path: "/faq" },
    { key: "terms_page_content",  label: "محتوى صفحة «شروط الاستخدام»", icon: "📄", path: "/terms" },
  ];

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Contact & Social Settings ── */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-5">
        <h3 className="text-slate-200 font-semibold text-lg">معلومات التواصل والسوشيال</h3>
        {settingFields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">{field.label}</label>
            {field.isTextarea ? (
              <Textarea
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                rows={3}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                dir={field.isLtr ? "ltr" : "rtl"}
              />
            ) : (
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                dir={field.isLtr ? "ltr" : "rtl"}
              />
            )}
          </div>
        ))}
        {/* Live WhatsApp preview */}
        {(form.platform_whatsapp || form.whatsapp_message) && (
          <div className="bg-slate-900/60 border border-slate-600 rounded-lg p-3 space-y-1">
            <p className="text-xs text-slate-400 font-semibold">معاينة رابط الواتساب:</p>
            <a
              href={`https://wa.me/${(form.platform_whatsapp ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(form.whatsapp_message ?? "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#25D366] break-all hover:underline"
            >
              {`https://wa.me/${(form.platform_whatsapp ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(form.whatsapp_message ?? "").slice(0, 40)}...`}
            </a>
          </div>
        )}
        <Button
          onClick={() => saveSettings.mutate(form)}
          disabled={saveSettings.isPending}
          className="bg-amber-600 hover:bg-amber-700 w-full"
        >
          {saved ? "✓ تم الحفظ" : saveSettings.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </div>

      {/* ── Page Content Sections ── */}
      {pageContentFields.map((field) => (
        <div key={field.key} className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-200 font-semibold text-base flex items-center gap-2">
              <span>{field.icon}</span>
              {field.label}
            </h3>
            <a
              href={field.path}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-amber-400 hover:text-amber-300 underline"
            >
              معاينة الصفحة ↗
            </a>
          </div>
          <p className="text-xs text-slate-400">
            اكتب المحتوى النصي للصفحة. يمكنك استخدام الأسطر الفارغة لتنسيق الفقرات.
          </p>
          <Textarea
            value={form[field.key] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
            placeholder={`اكتب محتوى ${field.label} هنا...`}
            rows={10}
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 text-sm leading-relaxed resize-y"
            dir="rtl"
          />
          <Button
            onClick={() => saveSettings.mutate(form)}
            disabled={saveSettings.isPending}
            className="bg-amber-600 hover:bg-amber-700 w-full"
          >
            {saved ? "✓ تم الحفظ" : saveSettings.isPending ? "جاري الحفظ..." : `حفظ ${field.label}`}
          </Button>
        </div>
      ))}
    </div>
  );
}

/* ── Chalets Verification Tab ─────────────────── */
function ChaletsVerifyTab() {
  const qc = useQueryClient();

  const { data: chalets = [], isLoading } = useQuery<AdminChalet[]>({
    queryKey: ["admin", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/admin/chalets");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const toggleVerify = useMutation({
    mutationFn: async ({ id, isVerified }: { id: number; isVerified: boolean }) => {
      const r = await apiFetch(`/admin/chalets/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ isVerified }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "chalets"] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">التحقق من الشاليهات</h2>
        <p className="text-slate-400 text-sm">{chalets.filter((c) => c.isVerified).length} موثق من أصل {chalets.length}</p>
      </div>

      {/* How-to guide */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-400 mb-1">كيفية التوثيق</p>
          <ol className="text-slate-400 list-decimal list-inside space-y-1 text-xs">
            <li>افتح طلب التسجيل وانقر رابط الحساب الاجتماعي للتحقق</li>
            <li>تأكد من تطابق اسم الشاليه في الحساب مع البيانات المقدمة</li>
            <li>فعّل مفتاح "موثق" لإظهار شارة التوثيق على البطاقة وصفحة التفاصيل</li>
          </ol>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800/80">
              <TableHead className="text-slate-300 text-right font-semibold">الشاليه</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الموقع</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الفئة</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الحالة</TableHead>
              <TableHead className="text-slate-300 text-center font-semibold">توثيق</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chalets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-12">لا توجد شاليهات بعد</TableCell>
              </TableRow>
            ) : chalets.map((c) => (
              <TableRow key={c.id} className="border-slate-700 hover:bg-slate-800/50 transition-colors">
                <TableCell className="font-semibold text-white">{c.nameAr}</TableCell>
                <TableCell className="text-slate-300 text-sm">
                  {c.location}
                  {c.district && <span className="text-slate-500"> · {c.district}</span>}
                </TableCell>
                <TableCell className="text-slate-400 text-sm">{c.category ?? "—"}</TableCell>
                <TableCell>
                  {c.isVerified ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-900/30 px-2.5 py-1 rounded-full border border-emerald-800">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      موثق
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 bg-slate-700/50 px-2.5 py-1 rounded-full border border-slate-600">
                      غير موثق
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <button
                    onClick={() => toggleVerify.mutate({ id: c.id, isVerified: !c.isVerified })}
                    disabled={toggleVerify.isPending}
                    title={c.isVerified ? "إلغاء التوثيق" : "منح التوثيق"}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      c.isVerified ? "bg-emerald-600" : "bg-slate-600"
                    } ${toggleVerify.isPending ? "opacity-60 cursor-not-allowed" : "hover:opacity-90 cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        c.isVerified ? "translate-x-1" : "translate-x-6"
                      }`}
                    />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ── Provider Submissions Tab ─────────────────── */
const PROVIDER_CATEGORY_LABELS: Record<string, string> = {
  bounce_houses: "🎪 نطيطات",
  ice_cream: "🍦 آيس كريم",
  productive_families: "🎀 أسر منتجة",
  catering: "🍽️ تموين وضيافة",
  photography: "📸 تصوير",
  decoration: "🎊 ديكور وتزيين",
  entertainment: "🎶 ترفيه وأناشيد",
  other: "✨ أخرى",
};

interface ProviderSubmission {
  id: number;
  businessName: string;
  category: string;
  city: string;
  descriptionAr: string | null;
  whatsappNumber: string;
  logoUrl: string | null;
  galleryPhotos: string[];
  status: string;
  adminNote: string | null;
  createdAt: string;
  ownerName?: string | null;
}

function ProviderReviewModal({
  sub,
  open,
  onClose,
}: {
  sub: ProviderSubmission | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [adminNote, setAdminNote] = useState("");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [step, setStep] = useState<"view" | "confirm-reject" | "confirm-revision">("view");

  useEffect(() => {
    if (open) { setAdminNote(sub?.adminNote ?? ""); setPhotoIdx(0); setStep("view"); }
  }, [open, sub]);

  const decide = useMutation({
    mutationFn: async ({ status, note }: { status: string; note?: string }) => {
      const r = await fetch(`${API}/admin/service-submissions/${sub!.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: note }),
        credentials: "include",
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "provider-submissions"] });
      onClose();
    },
  });

  if (!sub) return null;
  const photos = sub.galleryPhotos ?? [];
  const allPhotos = sub.logoUrl ? [sub.logoUrl, ...photos] : photos;
  const currentPhoto = allPhotos[photoIdx];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right text-lg font-bold flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            مراجعة طلب مزود خدمة
          </DialogTitle>
        </DialogHeader>

        {/* Photos */}
        {allPhotos.length > 0 && (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden aspect-video bg-muted">
              <img src={currentPhoto} alt="" className="w-full h-full object-cover" />
              {allPhotos.length > 1 && (
                <>
                  <button onClick={() => setPhotoIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPhotoIdx((i) => (i + 1) % allPhotos.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white text-xs bg-black/40 px-2 py-0.5 rounded-full">
                    {photoIdx + 1} / {allPhotos.length}
                  </div>
                </>
              )}
            </div>
            {allPhotos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto">
                {allPhotos.map((url, i) => (
                  <button key={i} onClick={() => setPhotoIdx(i)}
                    className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${i === photoIdx ? "border-amber-500" : "border-transparent opacity-60 hover:opacity-100"}`}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Details */}
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">اسم النشاط</p>
              <p className="font-semibold text-foreground">{sub.businessName}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">الفئة</p>
              <p className="font-semibold text-foreground">{PROVIDER_CATEGORY_LABELS[sub.category] ?? sub.category}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">المدينة</p>
              <p className="font-semibold text-foreground">{sub.city || "—"}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">واتساب</p>
              <a href={`https://wa.me/${sub.whatsappNumber}`} target="_blank" rel="noreferrer"
                className="font-semibold text-green-600 hover:underline flex items-center gap-1 dir-ltr">
                <Phone className="w-3.5 h-3.5" />{sub.whatsappNumber}
              </a>
            </div>
          </div>
          {sub.descriptionAr && (
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">وصف الخدمة</p>
              <p className="text-foreground leading-relaxed">{sub.descriptionAr}</p>
            </div>
          )}
          {sub.ownerName && (
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">المقدِّم</p>
              <p className="font-semibold text-foreground">{sub.ownerName}</p>
            </div>
          )}
        </div>

        {/* Admin Note */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">ملاحظة للمزود (تُرسل عند الرفض/التعديل)</label>
          <Textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="اكتب ملاحظتك هنا..."
            rows={3}
            className="resize-none"
          />
        </div>

        {/* Actions */}
        {step === "view" && (
          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border pt-4 flex gap-3">
            <Button onClick={() => decide.mutate({ status: "approved" })} disabled={decide.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold">
              <CheckCircle className="w-4 h-4 me-1.5" />قبول
            </Button>
            <Button onClick={() => setStep("confirm-revision")} variant="outline" disabled={decide.isPending}
              className="flex-1 border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 font-bold">
              <RotateCcw className="w-4 h-4 me-1.5" />طلب تعديل
            </Button>
            <Button onClick={() => setStep("confirm-reject")} variant="outline" disabled={decide.isPending}
              className="flex-1 border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold">
              <XCircle className="w-4 h-4 me-1.5" />رفض
            </Button>
          </div>
        )}
        {step === "confirm-reject" && (
          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border pt-4 space-y-2">
            <p className="text-sm font-semibold text-destructive text-center">تأكيد الرفض؟</p>
            <div className="flex gap-3">
              <Button onClick={() => decide.mutate({ status: "rejected", note: adminNote || undefined })}
                disabled={decide.isPending} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold">
                {decide.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد الرفض"}
              </Button>
              <Button variant="outline" onClick={() => setStep("view")} className="flex-1">رجوع</Button>
            </div>
          </div>
        )}
        {step === "confirm-revision" && (
          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border pt-4 space-y-2">
            <p className="text-sm font-semibold text-orange-600 text-center">تأكيد طلب التعديل؟</p>
            <div className="flex gap-3">
              <Button onClick={() => decide.mutate({ status: "needs_revision", note: adminNote || undefined })}
                disabled={decide.isPending} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold">
                {decide.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد"}
              </Button>
              <Button variant="outline" onClick={() => setStep("view")} className="flex-1">رجوع</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderSubmissionsTab() {
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected" | "needs_revision">("pending");
  const [selected, setSelected] = useState<ProviderSubmission | null>(null);
  const qc = useQueryClient();

  const { data: submissions = [], isLoading } = useQuery<ProviderSubmission[]>({
    queryKey: ["admin", "provider-submissions"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/service-submissions`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const filtered = filter === "all" ? submissions : submissions.filter((s) => s.status === filter);

  const STATUS_COLORS: Record<string, string> = {
    pending:        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    approved:       "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rejected:       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    needs_revision: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };
  const STATUS_LABELS: Record<string, string> = {
    pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض", needs_revision: "يحتاج تعديل",
  };

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">طلبات مزودي الخدمات</h2>
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount} معلق
            </span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[
          { id: "all",            label: `الكل (${submissions.length})` },
          { id: "pending",        label: `معلق (${submissions.filter(s => s.status === "pending").length})` },
          { id: "approved",       label: "مقبول" },
          { id: "rejected",       label: "مرفوض" },
          { id: "needs_revision", label: "يحتاج تعديل" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id as typeof filter)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
              filter === id
                ? "bg-amber-500 text-black border-amber-500"
                : "border-slate-600 text-slate-400 hover:border-amber-500/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>لا توجد طلبات في هذه الفئة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => {
            const mainPhoto = sub.galleryPhotos?.[0] ?? sub.logoUrl;
            return (
              <div
                key={sub.id}
                className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-start gap-4 hover:border-amber-500/40 transition-colors"
              >
                {mainPhoto ? (
                  <img src={mainPhoto} alt={sub.businessName} className="w-20 h-16 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-20 h-16 rounded-xl bg-slate-700 flex items-center justify-center text-2xl shrink-0">
                    {PROVIDER_CATEGORY_LABELS[sub.category]?.split(" ")[0] ?? "✨"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-bold text-white">{sub.businessName}</p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {PROVIDER_CATEGORY_LABELS[sub.category] ?? sub.category}
                        {sub.city ? ` — ${sub.city}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[sub.status] ?? ""}`}>
                      {STATUS_LABELS[sub.status] ?? sub.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                    <span className="text-xs text-slate-500">
                      {new Date(sub.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected(sub)}
                      className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs h-7"
                    >
                      <Eye className="w-3.5 h-3.5 me-1" />
                      مراجعة
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProviderReviewModal sub={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ── Expense Categories Tab ────────────────────── */
interface ExpCat { id: number; name: string; emoji: string; color: string; isOther: boolean; sortOrder: number; }

function ExpenseCategoriesTab() {
  const qc = useQueryClient();
  const [newForm, setNewForm] = useState({ name: "", emoji: "✨", color: "slate", isOther: false });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", emoji: "", color: "", isOther: false });

  const { data: cats = [], isLoading } = useQuery<ExpCat[]>({
    queryKey: ["admin", "expense-categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/expense-categories");
      if (!r.ok) throw new Error();
      return r.json();
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "expense-categories"] });
    qc.invalidateQueries({ queryKey: ["catalog", "expense-categories"] });
  };

  const addCat = useMutation({
    mutationFn: async () => {
      if (!newForm.name.trim()) throw new Error("الاسم مطلوب");
      const r = await apiFetch("/admin/expense-categories", {
        method: "POST",
        body: JSON.stringify({ ...newForm, name: newForm.name.trim(), sortOrder: cats.length }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => { setNewForm({ name: "", emoji: "✨", color: "slate", isOther: false }); invalidate(); },
  });

  const patchCat = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<ExpCat> }) => {
      const r = await apiFetch(`/admin/expense-categories/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => { setEditId(null); invalidate(); },
  });

  const deleteCat = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/expense-categories/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => invalidate(),
  });

  const COLORS = ["blue","yellow","cyan","purple","orange","green","slate","red","pink","teal"];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-amber-400">فئات المصروفات</h2>

      {/* Add form */}
      <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
        <h3 className="text-sm font-bold text-amber-300 mb-4">إضافة فئة جديدة</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-400 mb-1 block">اسم الفئة</label>
            <Input
              placeholder="مثال: تأمين، ضرائب..."
              value={newForm.name}
              onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
              className="h-9 text-sm bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div className="w-20">
            <label className="text-xs text-slate-400 mb-1 block">الأيقونة</label>
            <Input
              value={newForm.emoji}
              onChange={(e) => setNewForm((f) => ({ ...f, emoji: e.target.value }))}
              className="h-9 text-sm bg-slate-700 border-slate-600 text-white text-center"
            />
          </div>
          <div className="w-32">
            <label className="text-xs text-slate-400 mb-1 block">اللون</label>
            <select
              value={newForm.color}
              onChange={(e) => setNewForm((f) => ({ ...f, color: e.target.value }))}
              className="h-9 w-full rounded-md border border-slate-600 bg-slate-700 text-white text-sm px-2"
            >
              {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <input
              id="isOther"
              type="checkbox"
              checked={newForm.isOther}
              onChange={(e) => setNewForm((f) => ({ ...f, isOther: e.target.checked }))}
              className="w-4 h-4 accent-amber-400"
            />
            <label htmlFor="isOther" className="text-xs text-slate-300">يتطلب تسمية يدوية (أخرى)</label>
          </div>
          <Button
            size="sm"
            className="h-9 bg-amber-500 hover:bg-amber-600 text-black font-bold"
            onClick={() => addCat.mutate()}
            disabled={addCat.isPending || !newForm.name.trim()}
          >
            إضافة
          </Button>
        </div>
      </div>

      {/* Categories list */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-slate-400 text-sm">جارٍ التحميل...</div>
        ) : cats.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">لا توجد فئات بعد</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs">
                <th className="text-right p-4 font-medium">الفئة</th>
                <th className="text-right p-4 font-medium">اللون</th>
                <th className="text-right p-4 font-medium">نوع</th>
                <th className="p-4 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {cats.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-700/30">
                  <td className="p-4">
                    {editId === cat.id ? (
                      <div className="flex gap-2 items-center">
                        <Input value={editForm.emoji} onChange={(e) => setEditForm((f) => ({ ...f, emoji: e.target.value }))} className="w-12 h-8 text-center bg-slate-700 border-slate-600 text-white text-sm" />
                        <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 h-8 bg-slate-700 border-slate-600 text-white text-sm" />
                      </div>
                    ) : (
                      <span className="font-semibold text-white">{cat.emoji} {cat.name}</span>
                    )}
                  </td>
                  <td className="p-4">
                    {editId === cat.id ? (
                      <select value={editForm.color} onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))} className="h-8 rounded border border-slate-600 bg-slate-700 text-white text-xs px-2">
                        {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span className="text-slate-300 text-xs">{cat.color}</span>
                    )}
                  </td>
                  <td className="p-4">
                    {editId === cat.id ? (
                      <div className="flex items-center gap-1.5">
                        <input type="checkbox" checked={editForm.isOther} onChange={(e) => setEditForm((f) => ({ ...f, isOther: e.target.checked }))} className="w-4 h-4 accent-amber-400" />
                        <span className="text-xs text-slate-300">أخرى</span>
                      </div>
                    ) : cat.isOther ? (
                      <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">يدوية</span>
                    ) : (
                      <span className="text-xs text-slate-500">عادية</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {editId === cat.id ? (
                        <>
                          <button onClick={() => patchCat.mutate({ id: cat.id, patch: { name: editForm.name.trim(), emoji: editForm.emoji, color: editForm.color, isOther: editForm.isOther } })} className="text-xs text-green-400 hover:text-green-300 font-semibold">حفظ</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-slate-400 hover:text-slate-300">إلغاء</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(cat.id); setEditForm({ name: cat.name, emoji: cat.emoji, color: cat.color, isOther: cat.isOther }); }} className="text-xs text-amber-400 hover:text-amber-300">تعديل</button>
                          <button onClick={() => { if (confirm(`حذف فئة "${cat.name}"؟`)) deleteCat.mutate(cat.id); }} className="text-xs text-red-400 hover:text-red-300">حذف</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Plans Manager Tab ───────────────────────────────────── */
interface Plan {
  id: number;
  slug: string;
  nameAr: string;
  price: string;
  durationDays: number;
  trialDays: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

const BLANK_PLAN = {
  slug: "",
  nameAr: "",
  price: "",
  durationDays: 30,
  trialDays: 0,
  features: [] as string[],
  isActive: true,
  sortOrder: 0,
};

async function adminFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}/admin${path}`, { credentials: "include", ...opts });
}

function PlansTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...BLANK_PLAN });
  const [featuresInput, setFeaturesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const r = await adminFetch("/plans");
      if (!r.ok) throw new Error("فشل تحميل الخطط");
      return r.json();
    },
  });

  function openAdd() {
    setEditId(null);
    setForm({ ...BLANK_PLAN, sortOrder: plans.length });
    setFeaturesInput("");
    setError(null);
    setShowForm(true);
  }

  function openEdit(p: Plan) {
    setEditId(p.id);
    setForm({
      slug: p.slug,
      nameAr: p.nameAr,
      price: String(Number(p.price)),
      durationDays: p.durationDays,
      trialDays: p.trialDays,
      features: p.features ?? [],
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    });
    setFeaturesInput((p.features ?? []).join("\n"));
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const features = featuresInput
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const body = {
        ...form,
        price: Number(form.price),
        durationDays: Number(form.durationDays),
        trialDays: Number(form.trialDays),
        sortOrder: Number(form.sortOrder),
        features,
      };
      const r = editId
        ? await adminFetch(`/plans/${editId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await adminFetch("/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!r.ok) {
        const d = await r.json();
        setError(d.error ?? "فشل الحفظ");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await adminFetch(`/plans/${id}`, { method: "DELETE" });
    await qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    setDeleteId(null);
  }

  async function toggleActive(p: Plan) {
    await adminFetch(`/plans/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    await qc.invalidateQueries({ queryKey: ["admin", "plans"] });
  }

  const deletePlan = plans.find((p) => p.id === deleteId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-400" />
            إدارة خطط الاشتراك
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            الخطط المُفعّلة ستظهر للملاك في صفحة الاشتراك وتُستخدم في الدفع
          </p>
        </div>
        <Button
          onClick={openAdd}
          className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          إضافة خطة
        </Button>
      </div>

      {/* Plans list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-semibold mb-1">لا توجد خطط بعد</p>
          <p className="text-sm">أضف خطة اشتراك أولى لتبدأ</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-4"
            >
              {/* Active toggle */}
              <button
                onClick={() => toggleActive(p)}
                className="mt-0.5 shrink-0"
                title={p.isActive ? "إلغاء التفعيل" : "تفعيل"}
              >
                {p.isActive ? (
                  <ToggleRight className="w-7 h-7 text-green-400" />
                ) : (
                  <ToggleLeft className="w-7 h-7 text-slate-500" />
                )}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-bold text-white text-base">{p.nameAr}</span>
                  <span className="text-xs font-mono text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
                    {p.slug}
                  </span>
                  {p.isActive ? (
                    <span className="text-xs font-semibold text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">مُفعّل</span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">معطّل</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                  <span>
                    <span className="text-amber-400 font-bold">{Number(p.price).toLocaleString("ar-SA")}</span>
                    {" "}ر.س
                  </span>
                  <span>مدة: <span className="text-white font-semibold">{p.durationDays}</span> يوم</span>
                  {p.trialDays > 0 && (
                    <span className="text-blue-400">تجريبي: {p.trialDays} يوم</span>
                  )}
                  <span className="text-slate-500">ترتيب: {p.sortOrder}</span>
                </div>
                {(p.features ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(p.features ?? []).slice(0, 4).map((f, i) => (
                      <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                        {f}
                      </span>
                    ))}
                    {(p.features ?? []).length > 4 && (
                      <span className="text-xs text-slate-500">+{(p.features ?? []).length - 4} أخرى</span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(p)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  title="تعديل"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteId(p.id)}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) setShowForm(false); }}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" />
              {editId ? "تعديل الخطة" : "إضافة خطة جديدة"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">اسم الخطة *</label>
                <Input
                  placeholder="مثال: الخطة الذهبية"
                  value={form.nameAr}
                  onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">المعرّف (slug) *</label>
                <Input
                  placeholder="مثال: gold_plan"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">السعر (ر.س) *</label>
                <Input
                  type="number"
                  placeholder="99"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="bg-slate-800 border-slate-600 text-white"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">المدة (أيام) *</label>
                <Input
                  type="number"
                  placeholder="30"
                  value={form.durationDays}
                  onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })}
                  className="bg-slate-800 border-slate-600 text-white"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">أيام تجريبية</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.trialDays}
                  onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}
                  className="bg-slate-800 border-slate-600 text-white"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">ترتيب العرض</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  className="bg-slate-800 border-slate-600 text-white"
                  dir="ltr"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-slate-300">تفعيل الخطة</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                المميزات (سطر لكل ميزة)
              </label>
              <Textarea
                placeholder={"شاليه واحد\nإدارة الحجوزات\nتقارير شهرية"}
                value={featuresInput}
                onChange={(e) => setFeaturesInput(e.target.value)}
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 min-h-[100px] resize-none"
                rows={5}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleSave}
                disabled={saving || !form.nameAr || !form.slug || !form.price}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? "حفظ التعديلات" : "إضافة الخطة"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="border-slate-600 text-slate-300 hover:bg-slate-800 gap-2"
              >
                <X className="w-4 h-4" />
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">حذف الخطة</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              هل تريد حذف خطة <span className="text-white font-semibold">"{deletePlan?.nameAr}"</span> بشكل نهائي؟
              <br />لن يؤثر الحذف على الاشتراكات الحالية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-0 hover:bg-slate-600">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const TABS = [
  { id: "submissions",         label: "الطلبات",               icon: Settings },
  { id: "chaletVerify",        label: "التوثيق",                icon: ShieldCheck },
  { id: "services",            label: "خدمات المناسبات",       icon: Wrench },
  { id: "providerSubmissions", label: "طلبات مزودي الخدمات",  icon: Star },
  { id: "serviceCategories",   label: "فئات الخدمات",          icon: Tag },
  { id: "expenseCategories",   label: "فئات المصروفات",        icon: Tag },
  { id: "locations",           label: "المدن والأحياء",        icon: Building2 },
  { id: "amenities",           label: "المرافق",                icon: Tag },
  { id: "categories",          label: "فئات الشاليهات",        icon: Tag },
  { id: "owners",              label: "الملاك",                 icon: Users },
  { id: "plans",               label: "خطط الاشتراك",          icon: CreditCard },
  { id: "siteSettings",        label: "إعدادات الموقع",        icon: Settings },
] as const;

type TabId = typeof TABS[number]["id"];

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("submissions");

  const { data: accessCheck, isLoading: checkLoading, error: checkError } = useQuery({
    queryKey: ["admin", "check"],
    queryFn: async () => {
      const r = await apiFetch("/admin/submissions");
      if (r.status === 401) throw new Error("401");
      if (r.status === 403) throw new Error("403");
      return r.json();
    },
    retry: false,
  });

  if (isLoading || checkLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-400 w-10 h-10" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <h1 className="text-2xl font-bold mb-2">يجب تسجيل الدخول</h1>
        <a href={`${BASE}/api/auth/login`} className="mt-4 px-6 py-2 bg-amber-600 rounded-lg font-semibold hover:bg-amber-700">
          تسجيل الدخول
        </a>
      </div>
    );
  }

  if (checkError?.message === "403" || checkError?.message === "401") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white px-4" dir="rtl">
        <div className="text-6xl mb-6">🔐</div>
        <h1 className="text-2xl font-bold mb-2">إعداد حساب الإدارة</h1>
        <p className="text-slate-400 mb-8 text-center max-w-md">
          لتفعيل صلاحيات الإدارة، انسخ معرّفك أدناه وأضفه كمتغير بيئة باسم{" "}
          <code className="bg-slate-700 text-amber-400 px-1.5 py-0.5 rounded font-mono text-sm">ADMIN_USER_ID</code>
        </p>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm mb-6">
          <p className="text-slate-400 text-xs mb-2 font-semibold uppercase tracking-wider">معرّف حسابك</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-900 text-amber-300 text-sm font-mono px-3 py-2.5 rounded-lg border border-slate-600 break-all select-all">
              {user?.id ?? "—"}
            </code>
            <button
              onClick={() => {
                if (user?.id) navigator.clipboard.writeText(user.id);
              }}
              className="shrink-0 px-3 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              نسخ
            </button>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 w-full max-w-sm text-sm mb-8">
          <p className="text-slate-300 font-semibold mb-3">خطوات الإعداد:</p>
          <ol className="text-slate-400 space-y-2 list-decimal list-inside">
            <li>انسخ المعرّف أعلاه</li>
            <li>افتح إعدادات المشروع في Replit</li>
            <li>أضف متغير بيئة: <code className="text-amber-400 bg-slate-700 px-1 rounded">ADMIN_USER_ID</code></li>
            <li>الصق المعرّف كقيمة للمتغير</li>
            <li>أعد تشغيل السيرفر وحدّث الصفحة</li>
          </ol>
        </div>

        <a href={BASE || "/"} className="text-slate-400 hover:text-white transition-colors text-sm">
          ← العودة إلى الرئيسية
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white" dir="rtl">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">لوحة التحكم</h1>
            <p className="text-slate-400 text-xs mt-0.5">شاليهات القصيم</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm hidden sm:block">{[user?.firstName, user?.lastName].filter(Boolean).join(" ")}</span>
          <a
            href={BASE || "/"}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            العودة للموقع ←
          </a>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-slate-900 border-b border-slate-700 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === id
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="p-6 max-w-7xl mx-auto">
        {/* Stats row */}
        {activeTab === "submissions"         && <SubmissionsTab />}
        {activeTab === "chaletVerify"        && <ChaletsVerifyTab />}
        {activeTab === "services"            && <ServicesTab />}
        {activeTab === "providerSubmissions" && <ProviderSubmissionsTab />}
        {activeTab === "serviceCategories"   && <ServiceCategoriesTab />}
        {activeTab === "expenseCategories"   && <ExpenseCategoriesTab />}
        {activeTab === "locations"           && <LocationsTab />}
        {activeTab === "amenities"           && <AmenitiesTab />}
        {activeTab === "categories"          && <CategoriesTab />}
        {activeTab === "owners"              && <OwnersTab />}
        {activeTab === "plans"               && <PlansTab />}
        {activeTab === "siteSettings"        && <SettingsTab />}
      </main>
    </div>
  );
}
