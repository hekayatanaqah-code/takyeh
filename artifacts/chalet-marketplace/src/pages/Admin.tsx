import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { formatDualDate, toHijri } from "@/lib/hijri";
import { toAr, fromAr } from "@/lib/utils";
import { DualDatePicker } from "@/components/DualDatePicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useAdminStaffAuth } from "@/lib/useAdminStaffAuth";
import {
  ALL_ADMIN_PERM_KEYS,
  ADMIN_PERM_LABELS,
  ADMIN_TAB_PERMISSION,
  type AdminPermKey,
  type AdminStaffPermissions,
} from "@/lib/adminPermissions";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Loader2, Trash2, CheckCircle, XCircle, MapPin, Settings, Users, Tag, Building2, Wrench, Plus, Edit2, Phone, Eye, EyeOff, Calendar, ShieldCheck, ShieldOff, Shield, Clock, Zap, Globe, Heart, ExternalLink, Instagram, Twitter, AlertTriangle, RotateCcw, Home, DoorOpen, Star, Image as ImageIcon, ChevronLeft, ChevronRight, ChevronDown, GripVertical, ToggleLeft, ToggleRight, CreditCard, Save, X, Upload, Palette, TrendingUp, DollarSign, BarChart3, FileCheck, FileText, Check, Video, Mail, MessageSquare, Send, Inbox, Smartphone, Download, Paperclip, BookOpen, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChaletDiamondContent } from "@/components/chalet/ChaletDiamondContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

/** Display an ISO/YYYY-MM-DD date as "Hijri هـ · Gregorian م" */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dateStr = iso.split("T")[0];
  const { hijri, gregorian } = formatDualDate(dateStr);
  if (!hijri) return gregorian || "—";
  return `${hijri} · ${gregorian} م`;
}

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
  ownerRevisionNote?: string | null;
  suggestedCategoryName?: string | null;
  pendingCategoryApproval?: boolean;
  category?: string | null;
  ownerId?: string | null;
  /* extended pricing + terms fields (returned by API if submitted) */
  termsAndConditions?: string | null;
  maxGuests?: number | null;
  bedrooms?: number | null;
  priceMorning?: string | null;
  priceEvening?: string | null;
  priceFullDay?: string | null;
  priceWeekday?: string | null;
  priceWeekend?: string | null;
  slotMorning?: boolean;
  slotEvening?: boolean;
  slotFullDay?: boolean;
  morningCheckIn?: string | null;
  morningCheckOut?: string | null;
  eveningCheckIn?: string | null;
  eveningCheckOut?: string | null;
  fullDayCheckIn?: string | null;
  fullDayCheckOut?: string | null;
  dailyPrices?: Record<string, Record<string, number>> | null;
  logoUrl?: string | null;
  videoUrl?: string | null;
}

interface AdminChalet {
  id: number;
  submissionId?: number | null;
  nameAr: string;
  location: string;
  district?: string | null;
  category?: string | null;
  propertyType?: string | null;
  isVerified: boolean;
  isActive?: boolean;
  adminStatus?: "active" | "pending" | "paused" | "deleted";
  isPausedNow?: boolean;
  hiddenByOwner?: boolean;
  pausedFrom?: string | null;
  pausedUntil?: string | null;
  pausedDays?: number;
  pauseAlert?: boolean;
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
  ownerName: string;
  primaryProperty: string;
  whatsappNumber: string;
  location: string;
  district: string;
  propertyType: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  subscriptionStatus: string;
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

/* ── Arabic number formatter ──────────────────── */
function fmtAr(v: string | number | null | undefined) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return n.toLocaleString("ar-SA");
}

/* ── Admin Pricing Grid — Standalone 7-day table ── */
function AdminPricingGrid({ s }: { s: Submission }) {
  const DAYS = [
    { idx: 0, label: "الأحد",    isWeekend: false },
    { idx: 1, label: "الاثنين",  isWeekend: false },
    { idx: 2, label: "الثلاثاء", isWeekend: false },
    { idx: 3, label: "الأربعاء", isWeekend: false },
    { idx: 4, label: "الخميس",   isWeekend: false },
    { idx: 5, label: "الجمعة",   isWeekend: true  },
    { idx: 6, label: "السبت",    isWeekend: true  },
  ] as const;

  const daily = s.dailyPrices ?? null;

  /* If dailyPrices is set, use it; otherwise fall back to slot booleans + base prices */
  const getCell = (period: "morning" | "evening" | "fullday", dayIdx: number): string | null => {
    if (daily) {
      const val = daily[period]?.[String(dayIdx)];
      return val != null ? fmtAr(val) : null;
    }
    /* Fallback: same price every day if slot is enabled */
    if (period === "morning"  && s.slotMorning  !== false) return fmtAr(s.priceMorning);
    if (period === "evening"  && s.slotEvening  !== false) return fmtAr(s.priceEvening);
    if (period === "fullday"  && s.slotFullDay  !== false) return fmtAr(s.priceFullDay);
    return null;
  };

  const hasAnyPricing = daily || s.priceMorning || s.priceEvening || s.priceFullDay || s.priceWeekday;

  return (
    <div className="mx-6 mb-5 rounded-2xl overflow-hidden border border-amber-800/40 bg-slate-800/60">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-900/25 border-b border-amber-800/30">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-amber-300 font-bold text-sm">جدول الأسعار اليومية — راجع قبل القبول</p>
          <p className="text-slate-400 text-xs mt-0.5">
            {daily
              ? "تسعير يومي مفصّل — الأسعار بالريال السعودي"
              : "تسعير ثابت بدون تفصيل يومي — الأسعار بالريال السعودي"}
          </p>
        </div>
        {(s.priceWeekday || s.priceWeekend) && (
          <div className="flex gap-2 text-xs shrink-0">
            {s.priceWeekday && (
              <span className="bg-slate-700 border border-slate-600 text-amber-300 font-bold rounded-lg px-2 py-1">
                وسط الأسبوع: {fmtAr(s.priceWeekday)} ر.س
              </span>
            )}
            {s.priceWeekend && (
              <span className="bg-amber-900/30 border border-amber-700/40 text-amber-300 font-bold rounded-lg px-2 py-1">
                نهاية الأسبوع: {fmtAr(s.priceWeekend)} ر.س
              </span>
            )}
          </div>
        )}
      </div>

      {!hasAnyPricing ? (
        <div className="px-5 py-6 text-center text-slate-500 text-sm">
          لم يُدخل المالك أي بيانات تسعير
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
            <thead>
              <tr style={{ background: "#1e293b" }}>
                <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 12, color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #334155", minWidth: 90 }}>
                  اليوم
                </th>
                <th style={{ padding: "10px 10px", textAlign: "center", fontSize: 12, color: "#92400e", fontWeight: 700, borderBottom: "1px solid #334155" }}>
                  🌅 صباحي
                </th>
                <th style={{ padding: "10px 10px", textAlign: "center", fontSize: 12, color: "#3730a3", fontWeight: 700, borderBottom: "1px solid #334155" }}>
                  🌙 مسائي
                </th>
                <th style={{ padding: "10px 10px", textAlign: "center", fontSize: 12, color: "#065f46", fontWeight: 700, borderBottom: "1px solid #334155" }}>
                  ☀️ يوم كامل
                </th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map(({ idx, label, isWeekend }) => {
                const morning = getCell("morning", idx);
                const evening = getCell("evening", idx);
                const fullday = getCell("fullday", idx);
                return (
                  <tr
                    key={idx}
                    style={{
                      background: isWeekend ? "rgba(251,191,36,0.06)" : "transparent",
                      borderTop: "1px solid rgba(51,65,85,0.6)",
                    }}
                  >
                    <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: isWeekend ? 700 : 500, color: isWeekend ? "#fcd34d" : "#cbd5e1", whiteSpace: "nowrap" }}>
                      {label}{isWeekend ? " 🎉" : ""}
                    </td>
                    {([morning, evening, fullday] as const).map((val, pIdx) => (
                      <td key={pIdx} style={{ padding: "10px 10px", textAlign: "center" }}>
                        {val ? (
                          <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 14 }}>
                            {val}
                            <span style={{ fontSize: 10, color: "#94a3b8", marginRight: 2 }}>ر.س</span>
                          </span>
                        ) : (
                          <span style={{ color: "#475569", fontSize: 12 }}>غير متاح</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Check-in / Check-out times summary */}
      {(s.morningCheckIn || s.morningCheckOut || s.eveningCheckIn || s.eveningCheckOut || s.fullDayCheckIn || s.fullDayCheckOut) && (
        <div className="border-t border-slate-700/60 px-5 py-3 flex flex-wrap gap-3 text-xs text-slate-400">
          {(s.morningCheckIn || s.morningCheckOut) && (
            <span>🌅 صباحي: {[s.morningCheckIn && `دخول ${s.morningCheckIn}`, s.morningCheckOut && `خروج ${s.morningCheckOut}`].filter(Boolean).join(" — ")}</span>
          )}
          {(s.eveningCheckIn || s.eveningCheckOut) && (
            <span>🌙 مسائي: {[s.eveningCheckIn && `دخول ${s.eveningCheckIn}`, s.eveningCheckOut && `خروج ${s.eveningCheckOut}`].filter(Boolean).join(" — ")}</span>
          )}
          {(s.fullDayCheckIn || s.fullDayCheckOut) && (
            <span>☀️ يوم كامل: {[s.fullDayCheckIn && `دخول ${s.fullDayCheckIn}`, s.fullDayCheckOut && `خروج ${s.fullDayCheckOut}`].filter(Boolean).join(" — ")}</span>
          )}
        </div>
      )}
    </div>
  );
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

  /* ── Category approval state ── */
  const [showCatApprove, setShowCatApprove] = useState(false);
  const [catNameOverride, setCatNameOverride] = useState("");
  const [catEmoji, setCatEmoji] = useState("🏠");
  const [showCatReassign, setShowCatReassign] = useState(false);
  const [reassignCat, setReassignCat] = useState("");
  const [reassignNote, setReassignNote] = useState("");

  const qc = useQueryClient();

  const { data: existingCategories = [] } = useQuery<{ id: number; nameAr: string; emoji: string }[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/categories");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: showCatReassign,
  });

  const approveCatMutation = useMutation({
    mutationFn: async () => {
      if (!submission) return;
      const r = await apiFetch(`/admin/submissions/${submission.id}/approve-category`, {
        method: "POST",
        body: JSON.stringify({ nameOverride: catNameOverride.trim() || undefined, emoji: catEmoji }),
      });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => {
      setShowCatApprove(false);
      setCatNameOverride("");
      qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
      onClose();
    },
  });

  const reassignCatMutation = useMutation({
    mutationFn: async () => {
      if (!submission) return;
      const r = await apiFetch(`/admin/submissions/${submission.id}/reassign-category`, {
        method: "POST",
        body: JSON.stringify({ categoryName: reassignCat, ownerNote: reassignNote.trim() || undefined }),
      });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => {
      setShowCatReassign(false);
      setReassignCat("");
      setReassignNote("");
      qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
      onClose();
    },
  });

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
          className="bg-slate-900 border-slate-700 text-white max-w-5xl w-full p-0 flex flex-col"
          style={{ maxHeight: "92vh" }}
          dir="rtl"
        >
          {/* ── Sticky Header ───────────────────────────── */}
          <div className="shrink-0 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-6 py-4">
            <h2 className="text-xl font-bold text-white leading-tight">{s.nameAr}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={s.status} />
              {s.createdAt && (
                <span className="text-slate-400 text-xs">{fmtDate(s.createdAt)}</span>
              )}
              {s.pricePerNight && (
                <span className="text-amber-400 text-xs font-semibold">
                  {Number(s.pricePerNight).toLocaleString("ar-SA")} ر.س / ليلة
                </span>
              )}
            </div>
          </div>

          {/* ── Scrollable Body: Diamond Edition ── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-6">

              {/* ── Verification Panel: Phone + Instagram (the only required checks) ── */}
              <div className="mb-5 bg-slate-800/80 border border-slate-600/60 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  نقاط التحقق المطلوبة للقبول
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Phone */}
                  <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${s.whatsappNumber ? "bg-green-900/30 border-green-700/40" : "bg-red-900/20 border-red-700/40"}`}>
                    <Phone className={`w-4 h-4 shrink-0 ${s.whatsappNumber ? "text-green-400" : "text-red-400"}`} />
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-500 mb-0.5">رقم الجوال / واتساب</p>
                      {s.whatsappNumber
                        ? <p className="text-sm font-bold text-green-300">{toAr(s.whatsappNumber)}</p>
                        : <p className="text-xs text-red-400">غير مُدخل</p>
                      }
                    </div>
                    {s.whatsappNumber && <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mr-auto" />}
                  </div>

                  {/* Instagram / social */}
                  <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${s.socialLink ? "bg-green-900/30 border-green-700/40" : "bg-orange-900/20 border-orange-700/30"}`}>
                    <Instagram className={`w-4 h-4 shrink-0 ${s.socialLink ? "text-pink-400" : "text-orange-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-slate-500 mb-0.5">حساب إنستقرام</p>
                      {s.socialLink
                        ? <a href={s.socialLink} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-pink-300 hover:text-pink-200 truncate block transition-colors">{s.socialLink}</a>
                        : <p className="text-xs text-orange-400">غير مُدخل</p>
                      }
                    </div>
                    {s.socialLink && <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />}
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 pt-1">
                  بمجرد قبول الطلب يصبح صاحب الشاليه مالكاً موثّقاً تلقائياً في المنصة.
                </p>
              </div>

              {/* ── Logo Section ── */}
              {s.logoUrl && (
                <div className="mb-5 bg-slate-800/60 border border-slate-600/60 rounded-2xl p-4 flex items-center gap-4">
                  <div
                    className="w-20 h-20 rounded-2xl border-2 border-slate-500 bg-white flex items-center justify-center shrink-0 overflow-hidden cursor-zoom-in shadow-lg"
                    onClick={() => setLightboxUrl(s.logoUrl!)}
                    title="اضغط لتكبير الشعار"
                  >
                    <img src={s.logoUrl} alt="شعار الشاليه" className="max-w-full max-h-full object-contain p-1" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" /> شعار الشاليه (لوجو)
                    </p>
                    <p className="text-slate-300 text-sm">رفع المالك شعاراً — سيظهر في نتائج البحث والعقود</p>
                    <p className="text-slate-500 text-xs mt-1">اضغط على الشعار لعرضه بالحجم الكامل</p>
                  </div>
                </div>
              )}

              <ChaletDiamondContent
                mode="modal"
                data={{
                  nameAr: s.nameAr,
                  descriptionAr: s.descriptionAr,
                  location: s.location,
                  district: s.district,
                  maxGuests: s.maxGuests,
                  bedrooms: s.bedrooms,
                  propertyType: s.propertyType,
                  sections: s.sections,
                  category: s.category,
                  amenities: s.amenities,
                  photos: s.photos,
                  whatsappNumber: s.whatsappNumber,
                  mapsUrl: s.mapsUrl,
                  socialLink: s.socialLink,
                  termsAndConditions: s.termsAndConditions,
                  pricePerNight: s.pricePerNight,
                  priceMorning: s.priceMorning,
                  priceEvening: s.priceEvening,
                  priceFullDay: s.priceFullDay,
                  priceWeekday: s.priceWeekday,
                  priceWeekend: s.priceWeekend,
                  slotMorning: s.slotMorning,
                  slotEvening: s.slotEvening,
                  slotFullDay: s.slotFullDay,
                  morningCheckIn: s.morningCheckIn,
                  morningCheckOut: s.morningCheckOut,
                  eveningCheckIn: s.eveningCheckIn,
                  eveningCheckOut: s.eveningCheckOut,
                  fullDayCheckIn: s.fullDayCheckIn,
                  fullDayCheckOut: s.fullDayCheckOut,
                  dailyPrices: s.dailyPrices,
                }}
              />
            </div>

            {/* ── Standalone Pricing Grid — critical for admin verification ── */}
            <AdminPricingGrid s={s} />

            {/* Admin-only: previous note + reason input */}
            <div className="px-6 pb-4 space-y-4">
              {s.adminNote && (
                <div className="bg-orange-950/40 border border-orange-700/50 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-orange-300 text-sm font-bold mb-1">
                      {s.ownerRevisionNote ? "طلب التعديل المُرسَل للمالك" : "ملاحظة الإدارة السابقة"}
                    </p>
                    <p className="text-slate-300 text-sm">{s.adminNote}</p>
                  </div>
                </div>
              )}
              {s.ownerRevisionNote && (
                <div className="bg-blue-950/40 border border-blue-700/50 rounded-xl p-4 flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-blue-300 text-sm font-bold mb-1">رد المالك على طلب التعديل</p>
                    <p className="text-slate-300 text-sm">{s.ownerRevisionNote}</p>
                  </div>
                </div>
              )}
              {s.pendingCategoryApproval && s.suggestedCategoryName && (
                <div className="bg-yellow-950/40 border border-yellow-600/50 rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Tag className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-yellow-300 text-sm font-bold mb-1">الفئة مقترحة من المالك — تحتاج موافقة</p>
                      <p className="text-slate-200 text-base font-semibold">«{s.suggestedCategoryName}»</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setCatNameOverride(s.suggestedCategoryName ?? ""); setShowCatApprove(true); }}
                      className="bg-green-700 hover:bg-green-600 text-white text-xs font-bold flex-1">
                      ✅ إضافة الفئة وقبولها
                    </Button>
                    <Button size="sm" onClick={() => setShowCatReassign(true)}
                      className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex-1">
                      🔄 إعادة التعيين لفئة موجودة
                    </Button>
                  </div>
                </div>
              )}
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

      {/* ── Approve Category Dialog ── */}
      <Dialog open={showCatApprove} onOpenChange={setShowCatApprove}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right text-slate-100">إضافة الفئة المقترحة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-slate-400 text-sm text-right">يمكنك تعديل اسم الفئة قبل إضافتها، أو إبقاؤه كما هو.</p>
            <div className="space-y-2">
              <label className="text-slate-300 text-sm font-medium">اسم الفئة</label>
              <input
                value={catNameOverride}
                onChange={(e) => setCatNameOverride(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="اسم الفئة"
              />
            </div>
            <div className="space-y-2">
              <label className="text-slate-300 text-sm font-medium">الإيموجي</label>
              <input
                value={catEmoji}
                onChange={(e) => setCatEmoji(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="🏠"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={() => setShowCatApprove(false)}>إلغاء</Button>
              <Button
                className="flex-1 bg-green-700 hover:bg-green-600"
                disabled={!catNameOverride.trim() || approveCatMutation.isPending}
                onClick={() => approveCatMutation.mutate()}
              >
                {approveCatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "إضافة وقبول"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reassign Category Dialog ── */}
      <Dialog open={showCatReassign} onOpenChange={setShowCatReassign}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right text-slate-100">إعادة تعيين الفئة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-slate-400 text-sm text-right">اختر فئة موجودة لتعيين هذا الطلب إليها.</p>
            <div className="space-y-2">
              <label className="text-slate-300 text-sm font-medium">الفئة</label>
              <select
                value={reassignCat}
                onChange={(e) => setReassignCat(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="">— اختر فئة —</option>
                {existingCategories.map((c) => (
                  <option key={c.id} value={c.nameAr}>{c.emoji} {c.nameAr}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-slate-300 text-sm font-medium">ملاحظة للمالك (اختياري)</label>
              <textarea
                value={reassignNote}
                onChange={(e) => setReassignNote(e.target.value)}
                rows={2}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="مثال: تم تعيينك ضمن فئة استراحة بدلاً من الفئة المقترحة"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={() => setShowCatReassign(false)}>إلغاء</Button>
              <Button
                className="flex-1 bg-amber-700 hover:bg-amber-600"
                disabled={!reassignCat || reassignCatMutation.isPending}
                onClick={() => reassignCatMutation.mutate()}
              >
                {reassignCatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "تعيين الفئة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Submissions Tab ──────────────────────────── */
function SubmissionsTab({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  async function handleImpersonate(ownerId: string) {
    setImpersonating(ownerId);
    const r = await apiFetch("/admin/impersonate", {
      method: "POST",
      body: JSON.stringify({ ownerId }),
    });
    if (r.ok) {
      const { token } = await r.json();
      /* Navigate directly so the browser receives & stores the httpOnly cookie */
      window.location.href = `${API}/owner/enter-session?token=${token}`;
    } else {
      const err = await r.json().catch(() => ({}));
      alert(err.error ?? "حدث خطأ");
      setImpersonating(null);
    }
  }

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
                <TableCell className="text-slate-300 font-mono text-sm">{toAr(s.whatsappNumber)}</TableCell>
                <TableCell className="text-slate-300">{Number(s.pricePerNight).toLocaleString("ar-SA")} ر.س</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-slate-400 text-sm">
                  {s.trialEndsAt ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {fmtDate(s.trialEndsAt)}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-400 text-sm">{fmtDate(s.createdAt)}</TableCell>
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
                    {isSuperAdmin && s.ownerId && (
                      <button
                        onClick={() => handleImpersonate(s.ownerId!)}
                        disabled={impersonating === s.ownerId}
                        title="دخول بصلاحية المالك"
                        className="flex items-center gap-1 text-xs font-semibold text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {impersonating === s.ownerId
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                        دخول
                      </button>
                    )}
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
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  chalet: "شاليه",
  farm: "مزرعة",
  resort: "منتجع",
};

/* Normalise whatever is stored in the DB (Arabic, English, typos) → canonical key */
function normalisePropertyType(raw: string | null | undefined): "chalet" | "farm" | "resort" | "unknown" {
  if (!raw) return "chalet"; /* default — most entries are chalets */
  const v = raw.trim().toLowerCase();
  if (["chalet", "شاليه", "شالية", "شاليهات"].includes(v)) return "chalet";
  if (["farm", "مزرعة", "مزارع"].includes(v)) return "farm";
  if (["resort", "منتجع", "منتجعات"].includes(v)) return "resort";
  return "chalet"; /* safe fallback */
}

function DeleteSafeModal({
  target, entityLabel, onConfirm, onClose, isLoading = false,
}: {
  target: { name: string }; entityLabel: string;
  onConfirm: (reason: string) => void; onClose: () => void; isLoading?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const canDelete = reason.trim().length >= 3 && confirmText === "حذف";
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border border-slate-700 text-slate-100 max-w-md w-full" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <Trash2 className="w-5 h-5" />
            تأكيد حذف {entityLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-3 text-sm text-red-200">
            ⚠️ سيتم حذف <span className="font-bold text-white">{target.name}</span> بشكل ناعم — يُخفى من كل الواجهات مع الاحتفاظ بالبيانات للتقارير والعقود.
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-slate-300 font-medium block">سبب الحذف <span className="text-red-400">*</span></label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب سبب الحذف بوضوح..."
              className="bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500 resize-none"
              rows={3}
              dir="rtl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-slate-300 font-medium block">
              للتأكيد، اكتب كلمة <span className="font-bold text-red-300">حذف</span> في الحقل أدناه
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="حذف"
              className="bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
              dir="rtl"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose} className="border-slate-600 text-slate-300 hover:bg-slate-700">إلغاء</Button>
            <Button
              disabled={!canDelete || isLoading}
              onClick={() => canDelete && onConfirm(reason.trim())}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Trash2 className="w-4 h-4 ml-1" />}
              تأكيد الحذف
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OwnersTab({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [cityFilter, setCityFilter]       = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [typeFilter, setTypeFilter]       = useState("all");
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [archiveOwner, setArchiveOwner]   = useState<{ id: string; name: string } | null>(null);
  const [deleteOwnerTarget, setDeleteOwnerTarget] = useState<{ id: string; name: string } | null>(null);
  const qc = useQueryClient();

  /* ── Fetch owners ── */
  const { data: owners = [], isLoading } = useQuery({
    queryKey: ["admin", "owners"],
    queryFn: async () => {
      const r = await apiFetch("/admin/owners");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json() as Promise<Owner[]>;
    },
  });

  /* ── Fetch cities catalog ── */
  const { data: citiesCatalog = [] } = useQuery({
    queryKey: ["admin", "cities"],
    queryFn: async () => {
      const r = await apiFetch("/admin/cities");
      if (!r.ok) return [];
      return r.json() as Promise<{ id: number; name: string }[]>;
    },
  });

  /* ── Fetch all districts (used for hierarchical filtering) ── */
  const { data: allDistricts = [] } = useQuery({
    queryKey: ["admin", "districts"],
    queryFn: async () => {
      const r = await apiFetch("/admin/districts");
      if (!r.ok) return [];
      return r.json() as Promise<{ id: number; name: string; cityId: number }[]>;
    },
  });

  /* ── Dynamic categories from owners data ── */
  const dynamicCategories = useMemo(() => {
    const seen = new Set<string>();
    const cats: { key: string; label: string }[] = [{ key: "all", label: "الكل" }];
    for (const o of owners) {
      const k = normalisePropertyType(o.propertyType);
      if (!seen.has(k)) {
        seen.add(k);
        cats.push({ key: k, label: PROPERTY_TYPE_LABELS[k] ?? k });
      }
    }
    cats.push({ key: "service", label: "الخدمات" });
    return cats;
  }, [owners]);

  /* ── Districts filtered by selected city ── */
  const availableDistricts = useMemo(() => {
    if (!cityFilter) return [];
    const city = citiesCatalog.find((c) => c.name === cityFilter);
    if (!city) return [];
    return allDistricts.filter((d) => d.cityId === city.id);
  }, [cityFilter, citiesCatalog, allDistricts]);

  /* Reset district when city changes */
  useEffect(() => { setDistrictFilter(""); }, [cityFilter]);

  /* ── Apply filters ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return owners.filter((o) => {
      if (q && !o.ownerName.toLowerCase().includes(q) && !o.whatsappNumber.includes(q)) return false;
      if (cityFilter && o.location !== cityFilter) return false;
      if (districtFilter && (o.district ?? "") !== districtFilter) return false;
      if (typeFilter !== "all") {
        if (typeFilter === "service") return false; /* placeholder — no service owners yet */
        if (normalisePropertyType(o.propertyType) !== typeFilter) return false;
      }
      return true;
    });
  }, [owners, search, cityFilter, districtFilter, typeFilter]);

  const allSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.ownerId));
  const hasFilters  = search || cityFilter || districtFilter || typeFilter !== "all";

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((o) => next.delete(o.ownerId));
    else             filtered.forEach((o) => next.add(o.ownerId));
    setSelected(next);
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function handleImpersonate(ownerId: string) {
    setImpersonating(ownerId);
    const r = await apiFetch("/admin/impersonate", {
      method: "POST", body: JSON.stringify({ ownerId }),
    });
    if (r.ok) {
      const { token } = await r.json();
      window.location.href = `${API}/owner/enter-session?token=${token}`;
    } else {
      const err = await r.json().catch(() => ({}));
      alert(err.error ?? "حدث خطأ");
      setImpersonating(null);
    }
  }

  const softDeleteOwner = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const r = await apiFetch(`/admin/owners/${id}/soft-delete`, { method: "PATCH", body: JSON.stringify({ reason }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "فشل الحذف"); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "owners"] }); setDeleteOwnerTarget(null); },
    onError: (e: Error) => alert(e.message),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  const colSpan = isSuperAdmin ? 6 : 5;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">إدارة الملاك</h2>
          <p className="text-slate-400 text-sm mt-1">
            {owners.length > 0 ? `${toAr(owners.length)} مالك مسجّل` : "لا يوجد ملاك بعد"}
            {selected.size > 0 && <span className="mr-2 text-amber-400">— {toAr(selected.size)} محدّد</span>}
          </p>
        </div>
        {isSuperAdmin && (
          <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-full font-semibold">
            مشرف عام فقط
          </span>
        )}
      </div>

      {/* ── Category tabs (dynamic) ── */}
      <div className="flex flex-wrap gap-1.5">
        {dynamicCategories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setTypeFilter(cat.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors border ${
              typeFilter === cat.key
                ? "bg-amber-500 text-slate-900 border-amber-400"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white"
            }`}
          >
            {cat.label}
            {cat.key !== "all" && (
              <span className={`mr-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                typeFilter === cat.key ? "bg-slate-900/30" : "bg-slate-700 text-slate-400"
              }`}>
                {cat.key === "service"
                  ? toAr(0)
                  : toAr(owners.filter((o) => normalisePropertyType(o.propertyType) === cat.key).length)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700">
        {/* Search */}
        <div className="relative sm:col-span-1">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الجوال..."
            className="w-full bg-slate-900 border border-slate-600 rounded-lg text-sm text-white pr-9 pl-3 py-2 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>

        {/* City dropdown (from catalog) */}
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500/60"
        >
          <option value="">كل المدن</option>
          {citiesCatalog.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>

        {/* District dropdown — dependent on city */}
        <select
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          disabled={!cityFilter || availableDistricts.length === 0}
          className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">
            {!cityFilter ? "اختر المدينة أولاً" : availableDistricts.length === 0 ? "لا توجد أحياء" : "كل الأحياء"}
          </option>
          {availableDistricts.map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Active filter summary + clear */}
      {hasFilters && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>الفلاتر النشطة:</span>
          {typeFilter !== "all" && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{dynamicCategories.find((c) => c.key === typeFilter)?.label}</span>}
          {cityFilter && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{cityFilter}</span>}
          {districtFilter && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{districtFilter}</span>}
          {search && <span className="bg-slate-700 px-2 py-0.5 rounded-full">"{search}"</span>}
          <button
            onClick={() => { setSearch(""); setCityFilter(""); setDistrictFilter(""); setTypeFilter("all"); }}
            className="mr-auto text-slate-500 hover:text-white transition-colors"
          >
            مسح الكل ✕
          </button>
        </div>
      )}

      {/* Results count */}
      {hasFilters && (
        <p className="text-xs text-slate-500">
          عرض <span className="text-white font-semibold">{toAr(filtered.length)}</span> من أصل <span className="text-white font-semibold">{toAr(owners.length)}</span> مالك
        </p>
      )}

      {/* ── Table ── */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="w-10 text-center">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="w-4 h-4 rounded accent-amber-400 cursor-pointer" />
              </TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">اسم المالك</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">العقار الرئيسي</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الجوال / واتساب</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">تاريخ الانضمام</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-14">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                    <p>{owners.length === 0 ? "لا يوجد ملاك مسجلون بعد" : "لا توجد نتائج تطابق الفلاتر"}</p>
                    {hasFilters && owners.length > 0 && (
                      <button onClick={() => { setSearch(""); setCityFilter(""); setDistrictFilter(""); setTypeFilter("all"); }}
                        className="text-amber-400 hover:text-amber-300 text-sm mt-1">
                        مسح الفلاتر والعرض الكامل
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((owner) => (
              <TableRow
                key={owner.ownerId}
                className={`border-slate-700 transition-colors ${selected.has(owner.ownerId) ? "bg-amber-500/5" : "hover:bg-slate-800/50"}`}
              >
                <TableCell className="text-center">
                  <input type="checkbox" checked={selected.has(owner.ownerId)} onChange={() => toggleOne(owner.ownerId)}
                    className="w-4 h-4 rounded accent-amber-400 cursor-pointer" />
                </TableCell>

                {/* Owner Name */}
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white font-medium text-sm">{owner.ownerName}</span>
                    <span className="font-mono text-[10px] text-slate-500 max-w-[160px] truncate cursor-default" title={owner.ownerId}>
                      {owner.ownerId}
                    </span>
                  </div>
                </TableCell>

                {/* Primary property */}
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-200 text-sm">{owner.primaryProperty || "—"}</span>
                    {owner.primaryProperty && owner.primaryProperty !== "—" && (
                      <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {PROPERTY_TYPE_LABELS[normalisePropertyType(owner.propertyType)] ?? "شاليه"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {owner.location && <span className="text-slate-500 text-xs">{owner.location}</span>}
                    {owner.location && owner.district && <span className="text-slate-600 text-xs">←</span>}
                    {owner.district && <span className="text-slate-500 text-xs">{owner.district}</span>}
                  </div>
                </TableCell>

                {/* Phone + WhatsApp reminder */}
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-slate-300 font-mono text-sm ltr">{toAr(owner.whatsappNumber) || "—"}</span>
                    {owner.whatsappNumber && (() => {
                      const num = owner.whatsappNumber.replace(/\D/g, "");
                      const intlNum = num.startsWith("0") ? "966" + num.slice(1) : num;
                      const daysLeft = owner.expiresAt
                        ? Math.ceil((new Date(owner.expiresAt).getTime() - Date.now()) / 86400000)
                        : null;
                      const expiryStr = daysLeft !== null
                        ? (daysLeft < 0 ? `انتهى منذ ${toAr(Math.abs(daysLeft))} يوم` : `يتبقى ${toAr(daysLeft)} يوم`)
                        : "غير محدّد";
                      const msg = `السلام عليكم ${owner.ownerName}،\nنُذكّركم من فريق تكية أن اشتراككم في المنصة ${expiryStr}. يُرجى التواصل معنا لتجديد الاشتراك والاستمرار في الاستفادة من كافة المميزات.\nشكراً لثقتكم 🌟`;
                      const waLink = `https://wa.me/${intlNum}?text=${encodeURIComponent(msg)}`;
                      return (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-400 border border-green-700/40 bg-green-900/20 hover:bg-green-900/40 px-2 py-1 rounded-md transition-colors whitespace-nowrap"
                        >
                          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          إرسال تذكير بالاشتراك
                        </a>
                      );
                    })()}
                  </div>
                </TableCell>

                {/* Join date */}
                <TableCell className="text-slate-400 text-sm whitespace-nowrap">
                  {owner.createdAt ? fmtDate(owner.createdAt) : "—"}
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setArchiveOwner({ id: owner.ownerId, name: owner.ownerName })}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Inbox className="w-3.5 h-3.5" />
                      أرشيف المراسلات
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleImpersonate(owner.ownerId)}
                        disabled={impersonating === owner.ownerId}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {impersonating === owner.ownerId
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                        دخول للحساب
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteOwnerTarget({ id: owner.ownerId, name: owner.ownerName })}
                      title="حذف المالك"
                      className="flex items-center gap-1.5 text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      حذف
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {deleteOwnerTarget && (
        <DeleteSafeModal
          target={deleteOwnerTarget}
          entityLabel="المالك"
          isLoading={softDeleteOwner.isPending}
          onClose={() => setDeleteOwnerTarget(null)}
          onConfirm={(reason) => softDeleteOwner.mutate({ id: deleteOwnerTarget.id, reason })}
        />
      )}

      {/* Owner Archive Dialog */}
      {archiveOwner && (
        <Dialog open onOpenChange={() => setArchiveOwner(null)}>
          <DialogContent className="bg-slate-900 border border-slate-700 text-slate-100 max-w-2xl w-full max-h-[85vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-100">
                <Inbox className="w-5 h-5 text-amber-400" />
                أرشيف المراسلات — {archiveOwner.name}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2">
              <OwnerInboxTab ownerIdFilter={archiveOwner.id} />
            </div>
          </DialogContent>
        </Dialog>
      )}
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
                type="text"
                inputMode="tel"
                value={toAr(form.whatsappNumber)}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: fromAr(e.target.value) }))}
                placeholder="٩٦٦٥٠١٢٣٤٥٦٧"
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
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
                        ? `${toAr(Number(svc.price).toLocaleString())} ر.س`
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
  const [newEmoji, setNewEmoji] = useState("🏠");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  interface Category { id: number; nameAr: string; emoji: string; isActive: boolean; showSectionFilter: boolean }

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/categories");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const addCategory = useMutation({
    mutationFn: async ({ nameAr, emoji }: { nameAr: string; emoji: string }) => {
      const r = await apiFetch("/admin/categories", { method: "POST", body: JSON.stringify({ nameAr, emoji }) });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => { setNewName(""); setNewEmoji("🏠"); qc.invalidateQueries({ queryKey: ["admin", "categories"] }); },
  });

  const updateEmoji = useMutation({
    mutationFn: async ({ id, emoji }: { id: number; emoji: string }) => {
      const r = await apiFetch(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify({ emoji }) });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });

  const toggleSectionFilter = useMutation({
    mutationFn: async ({ id, showSectionFilter }: { id: number; showSectionFilter: boolean }) => {
      const r = await apiFetch(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify({ showSectionFilter }) });
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
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            placeholder="🏠"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 w-16 text-center text-xl shrink-0"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثال: شالية، مزرعة، استراحة"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) addCategory.mutate({ nameAr: newName.trim(), emoji: newEmoji }); }}
          />
          <Button
            onClick={() => newName.trim() && addCategory.mutate({ nameAr: newName.trim(), emoji: newEmoji })}
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
                <TableHead className="text-slate-300 text-right w-14">إيموجي</TableHead>
                <TableHead className="text-slate-300 text-right">اسم الفئة</TableHead>
                <TableHead className="text-slate-300 text-right">الحالة</TableHead>
                <TableHead className="text-slate-300 text-right">فلتر الأقسام</TableHead>
                <TableHead className="text-slate-300 text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id} className="border-slate-700 hover:bg-slate-800/50">
                  <TableCell>
                    <input
                      defaultValue={cat.emoji || "🏠"}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val && val !== cat.emoji) updateEmoji.mutate({ id: cat.id, emoji: val });
                      }}
                      className="w-10 text-center text-xl bg-transparent border border-transparent hover:border-slate-600 focus:border-amber-500 rounded px-1 outline-none transition-colors"
                      title="انقر لتعديل الإيموجي"
                    />
                  </TableCell>
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
                    <button
                      onClick={() => toggleSectionFilter.mutate({ id: cat.id, showSectionFilter: !cat.showSectionFilter })}
                      title="تفعيل فلتر الأقسام (قسم / قسمين) في شريط البحث لهذه الفئة"
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${cat.showSectionFilter ? "bg-amber-800/50 text-amber-400" : "bg-slate-700 text-slate-400"}`}
                    >
                      {cat.showSectionFilter ? "🔑 مفعّل" : "معطّل"}
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
const PRESET_COLORS = ["#d97706", "#16a34a", "#2563eb", "#9333ea", "#dc2626", "#0891b2", "#c2410c", "#0f766e"];

async function uploadSettingImage(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/api/storage/uploads/process`, { method: "POST", body: formData });
  if (!res.ok) return null;
  const data = await res.json();
  return data.url ?? null;
}

function SocialToggleRow({
  label, icon, urlKey, showKey, form, setForm,
}: {
  label: string; icon: React.ReactNode; urlKey: string; showKey: string;
  form: Record<string, string>; setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const enabled = form[showKey] !== "0";
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${enabled ? "border-amber-500/40 bg-slate-900/60" : "border-slate-700 bg-slate-900/20 opacity-60"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-200 font-medium">
          {icon}
          <span>{label}</span>
        </div>
        <button
          onClick={() => setForm((f) => ({ ...f, [showKey]: enabled ? "0" : "1" }))}
          className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-amber-500" : "bg-slate-600"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "right-0.5" : "left-0.5"}`} />
        </button>
      </div>
      {enabled && (
        <Input
          value={form[urlKey] ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [urlKey]: e.target.value }))}
          placeholder="https://..."
          className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-sm"
          dir="ltr"
        />
      )}
    </div>
  );
}

const FEAT_ICONS: { key: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "map-pin",      label: "موقع",    Icon: MapPin },
  { key: "shield",       label: "أمان",    Icon: Shield },
  { key: "clock",        label: "وقت",     Icon: Clock },
  { key: "credit-card",  label: "دفع",     Icon: CreditCard },
  { key: "star",         label: "مميز",    Icon: Star },
  { key: "users",        label: "مجتمع",   Icon: Users },
  { key: "home",         label: "منزل",    Icon: Home },
  { key: "phone",        label: "دعم",     Icon: Phone },
  { key: "check-circle", label: "تحقق",    Icon: CheckCircle },
  { key: "zap",          label: "سرعة",    Icon: Zap },
  { key: "calendar",     label: "مواعيد",  Icon: Calendar },
  { key: "globe",        label: "شامل",    Icon: Globe },
  { key: "heart",        label: "مفضل",    Icon: Heart },
  { key: "search",       label: "بحث",     Icon: Eye },
];

function IconPickerField({
  fieldKey, form, setForm,
}: { fieldKey: string; form: Record<string, string>; setForm: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  const selected = form[fieldKey];
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">الأيقونة</label>
      <div className="flex flex-wrap gap-2">
        {FEAT_ICONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setForm((f) => ({ ...f, [fieldKey]: key }))}
            title={label}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-xs transition-all ${
              selected === key
                ? "border-amber-400 bg-amber-500/20 text-amber-300"
                : "border-slate-600 bg-slate-900/70 text-slate-400 hover:border-slate-400"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved]                     = useState(false);
  const [logoUploading, setLogoUploading]     = useState(false);
  const [heroBgUploading, setHeroBgUploading] = useState(false);

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const r = await apiFetch("/admin/settings");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const r = await apiFetch("/admin/settings", { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل الحفظ");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["siteSettings"] });
      qc.invalidateQueries({ queryKey: ["page-content"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const url = await uploadSettingImage(file);
    setLogoUploading(false);
    if (url) setForm((f) => ({ ...f, site_logo_url: `${BASE}${url}` }));
  }

  async function handleHeroBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeroBgUploading(true);
    const url = await uploadSettingImage(file);
    setHeroBgUploading(false);
    if (url) setForm((f) => ({ ...f, hero_bg_url: `${BASE}${url}` }));
  }

  const pageContentFields = [
    { key: "about_page_content",   label: "محتوى صفحة «من نحن»",          icon: "ℹ️", path: "/about"    },
    { key: "faq_page_content",     label: "محتوى صفحة «أسئلة شائعة»",     icon: "❓", path: "/faq"      },
    { key: "terms_page_content",   label: "محتوى صفحة «شروط الاستخدام»",  icon: "📄", path: "/terms"    },
    { key: "privacy_page_content", label: "محتوى صفحة «سياسة الخصوصية»",  icon: "🔒", path: "/privacy"  },
  ];

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>;

  const SaveBtn = ({ label }: { label: string }) => (
    <Button onClick={() => saveSettings.mutate(form)} disabled={saveSettings.isPending} className="bg-amber-600 hover:bg-amber-700 w-full gap-2">
      <Save className="w-4 h-4" />
      {saved ? "✓ تم الحفظ" : saveSettings.isPending ? "جاري الحفظ..." : label}
    </Button>
  );

  return (
    <div className="max-w-2xl space-y-6">

      {/* ══ 0. Branding ══ */}
      <div className="bg-slate-800 rounded-xl border border-amber-500/40 overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500/20 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <ImageIcon className="w-5 h-5 text-amber-400" />
          <h3 className="text-slate-100 font-bold text-lg">الهوية البصرية (Branding)</h3>
        </div>
        <div className="p-6 space-y-5">
          {/* Site Display Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">اسم الموقع في القائمة والترويسة</label>
            <Input value={form.site_display_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, site_display_name: e.target.value }))}
              placeholder="تكية" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 text-base font-bold" dir="rtl" />
            <p className="text-xs text-slate-500">يظهر بجانب الشعار في شريط التنقل وأسفل الصفحة.</p>
          </div>
          {/* Logo Upload */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">شعار الموقع (Logo)</label>
            {form.site_logo_url && (
              <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-slate-900 border border-slate-600 flex items-center justify-center">
                <img src={form.site_logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, site_logo_url: "" }))}
                  className="absolute top-1 left-1 text-white bg-black/50 hover:bg-red-600/80 h-6 w-6 p-0 rounded-full"><X className="w-3 h-3" /></Button>
              </div>
            )}
            <div className="flex gap-3 flex-wrap items-center">
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload-branding" />
              <label htmlFor="logo-upload-branding" className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2 rounded-lg border border-slate-600 transition-colors flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />{logoUploading ? "جاري الرفع..." : "رفع الشعار"}
              </label>
              {form.site_logo_url && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> تم الرفع</span>}
            </div>
          </div>
          {/* Logo Size */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">حجم الشعار</label>
            <div className="flex gap-2">
              {(["sm", "md", "lg"] as const).map((s) => (
                <button key={s} type="button"
                  onClick={() => setForm((f) => ({ ...f, logo_size: s }))}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.logo_size === s ? "bg-amber-600 border-amber-500 text-white" : "bg-slate-900 border-slate-600 text-slate-400 hover:text-white"}`}>
                  {s === "sm" ? "صغير" : s === "md" ? "متوسط" : "كبير"}
                </button>
              ))}
            </div>
          </div>
          <SaveBtn label="حفظ الهوية البصرية" />
        </div>
      </div>

      {/* ══ 1. Home Page Content ══ */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Home className="w-5 h-5 text-amber-400" />
          <h3 className="text-slate-100 font-bold text-lg">محتوى الصفحة الرئيسية</h3>
        </div>
        <div className="p-6 space-y-5">
          {/* Hero Line 1 + Line 2 */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 space-y-3">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">العنوان الرئيسي (سطرين)</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">السطر الأول (الكلمة الأولى ملوّنة)</label>
              <Input value={form.hero_line1 ?? ""} onChange={(e) => setForm((f) => ({ ...f, hero_line1: e.target.value }))}
                placeholder="تكيّـة .." className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 text-lg font-bold" dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">السطر الثاني</label>
              <Input value={form.hero_line2 ?? ""} onChange={(e) => setForm((f) => ({ ...f, hero_line2: e.target.value }))}
                placeholder="بوابتك المتكاملة لأجمل الوجهات و الخدمات" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">لون الكلمة الأولى</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.hero_word_color ?? "#F59E0B"}
                  onChange={(e) => setForm((f) => ({ ...f, hero_word_color: e.target.value }))}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-slate-600 bg-transparent p-0.5"
                />
                <span className="text-sm font-mono text-slate-300">{form.hero_word_color ?? "#F59E0B"}</span>
                <span className="text-2xl font-extrabold" style={{ color: form.hero_word_color ?? "#F59E0B" }}>
                  {(form.hero_line1 ?? "تكيّة").trim().split(/\s+/)[0]}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500">اترك السطرين فارغين لاستخدام العنوان التقليدي (حقل «العنوان الرئيسي» أدناه).</p>
          </div>
          {/* Hero Title (legacy single field) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">العنوان الرئيسي (احتياطي — يُستخدم إن تُركت السطور أعلاه فارغة)</label>
            <Input value={form.hero_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, hero_title: e.target.value }))}
              placeholder="اكتشف أجمل الشاليهات في القصيم"
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 text-base" dir="rtl" />
          </div>
          {/* Hero Subtitle */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">النص الوصفي (تحت العنوان)</label>
            <Textarea value={form.hero_subtitle ?? ""} onChange={(e) => setForm((f) => ({ ...f, hero_subtitle: e.target.value }))}
              placeholder="نوفر لك أفضل تجربة إقامة في أجمل شاليهات المنطقة..."
              rows={3} className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none" dir="rtl" />
          </div>
          {/* Hero BG Image */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">صورة خلفية القسم الرئيسي</label>
            {form.hero_bg_url && (
              <div className="relative w-full h-32 rounded-xl overflow-hidden bg-slate-900 border border-slate-600">
                <img src={form.hero_bg_url} alt="Hero BG" className="w-full h-full object-cover" />
                <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, hero_bg_url: "" }))}
                  className="absolute top-2 left-2 text-white bg-black/50 hover:bg-red-600/80 h-7 w-7 p-0 rounded-full"><X className="w-3.5 h-3.5" /></Button>
              </div>
            )}
            <div className="flex gap-3">
              <input type="file" accept="image/*" onChange={handleHeroBgUpload} className="hidden" id="hero-bg-upload" />
              <label htmlFor="hero-bg-upload" className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2 rounded-lg border border-slate-600 transition-colors flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />{heroBgUploading ? "جاري الرفع..." : "رفع صورة الخلفية"}
              </label>
              {form.hero_bg_url && <span className="text-xs text-green-400 flex items-center gap-1 self-center"><CheckCircle className="w-3 h-3" /> مرفوعة</span>}
            </div>
          </div>
          <SaveBtn label="حفظ محتوى الصفحة الرئيسية" />
        </div>
      </div>

      {/* ══ 2. Features List ══ */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-l from-green-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <h3 className="text-slate-100 font-bold text-lg">المميزات الرئيسية</h3>
          <span className="text-xs text-slate-500 mr-auto">تظهر تحت العنوان الرئيسي في الصفحة</span>
        </div>
        <div className="p-6 space-y-4">
          {[
            { key: "feature_1", default: "أفضل الشاليهات",     num: "١" },
            { key: "feature_2", default: "حجز سهل وآمن",       num: "٢" },
            { key: "feature_3", default: "دعم فني متواصل",      num: "٣" },
          ].map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0">{f.num}</span>
              <Input value={form[f.key] ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.default}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-400 flex-1" dir="rtl" />
            </div>
          ))}
          <p className="text-xs text-slate-500 pt-1">اترك الحقل فارغاً لاستخدام النص الافتراضي.</p>
          <SaveBtn label="حفظ المميزات" />
        </div>
      </div>

      {/* ══ 2.5. Bottom Feature Cards ══ */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-l from-teal-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-teal-400" />
          <h3 className="text-slate-100 font-bold text-lg">قسم المميزات السفلي</h3>
          <span className="text-xs text-slate-500 mr-auto">البطاقات الثلاث في أسفل الصفحة الرئيسية</span>
        </div>
        <div className="p-6 space-y-5">

          {/* ─ Card 1 ─ */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs font-bold flex items-center justify-center">١</span>
              <p className="text-xs font-bold text-teal-400 uppercase tracking-wider">البطاقة الأولى</p>
            </div>
            <IconPickerField fieldKey="feat_card1_icon" form={form} setForm={setForm} />
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">العنوان</label>
              <Input value={form.feat_card1_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_card1_title: e.target.value }))}
                placeholder="تغطية شاملة" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">النص الوصفي</label>
              <Textarea value={form.feat_card1_text ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_card1_text: e.target.value }))}
                placeholder="خيارات واسعة تشمل بريدة، عنيزة، الرس وكافة مدن ومحافظات القصيم." rows={2}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none" dir="rtl" />
            </div>
          </div>

          {/* ─ Card 2 ─ */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs font-bold flex items-center justify-center">٢</span>
              <p className="text-xs font-bold text-teal-400 uppercase tracking-wider">البطاقة الثانية</p>
            </div>
            <IconPickerField fieldKey="feat_card2_icon" form={form} setForm={setForm} />
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">العنوان</label>
              <Input value={form.feat_card2_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_card2_title: e.target.value }))}
                placeholder="حجز مباشر وآمن" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">النص الوصفي</label>
              <Textarea value={form.feat_card2_text ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_card2_text: e.target.value }))}
                placeholder="تواصل مباشر مع الملاك وإدارة الشاليهات عبر الواتساب بدون وسطاء." rows={2}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none" dir="rtl" />
            </div>
          </div>

          {/* ─ Card 3 ─ */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-xs font-bold flex items-center justify-center">٣</span>
              <p className="text-xs font-bold text-teal-400 uppercase tracking-wider">البطاقة الثالثة</p>
            </div>
            <IconPickerField fieldKey="feat_card3_icon" form={form} setForm={setForm} />
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">العنوان</label>
              <Input value={form.feat_card3_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_card3_title: e.target.value }))}
                placeholder="سهولة الدفع" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">النص الوصفي</label>
              <Textarea value={form.feat_card3_text ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_card3_text: e.target.value }))}
                placeholder="طرق دفع متعددة وآمنة تناسب احتياجاتك." rows={2}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none" dir="rtl" />
            </div>
          </div>

          <p className="text-xs text-slate-500">اترك أي حقل فارغاً لاستخدام النص الافتراضي. انقر على الأيقونة لتغييرها.</p>
          <SaveBtn label="حفظ بطاقات المميزات" />
        </div>
      </div>

      {/* ══ 2.7. "لماذا تختار" Section Header ══ */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-l from-purple-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Star className="w-5 h-5 text-purple-400" />
          <h3 className="text-slate-100 font-bold text-lg">عنوان قسم «لماذا تختار»</h3>
          <span className="text-xs text-slate-500 mr-auto">يظهر فوق البطاقات الثلاث</span>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">عنوان القسم</label>
            <Input value={form.feat_section_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_section_title: e.target.value }))}
              placeholder="لماذا تختار شاليهات القصيم؟"
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">النص الوصفي أسفل العنوان</label>
            <Textarea value={form.feat_section_desc ?? ""} onChange={(e) => setForm((f) => ({ ...f, feat_section_desc: e.target.value }))}
              placeholder="نحن نسهل عليك العثور على المكان المثالي لمناسباتك العائلية والخاصة"
              rows={2} className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none" dir="rtl" />
          </div>
          <SaveBtn label="حفظ عنوان القسم" />
        </div>
      </div>

      {/* ══ 3. Contact Info ══ */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-l from-blue-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Phone className="w-5 h-5 text-blue-400" />
          <h3 className="text-slate-100 font-bold text-lg">بيانات التواصل</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">رقم الواتساب الرئيسي (بدون +)</label>
            <Input value={form.platform_whatsapp ?? ""} onChange={(e) => setForm((f) => ({ ...f, platform_whatsapp: e.target.value }))}
              placeholder="966500000000" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 font-mono" dir="ltr" />
            <p className="text-xs text-slate-500">يظهر في التذييل وزر التواصل. ابدأ بـ 966 بدون +.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص رسالة الواتساب التلقائية</label>
            <Textarea value={form.whatsapp_message ?? ""} onChange={(e) => setForm((f) => ({ ...f, whatsapp_message: e.target.value }))}
              placeholder="مرحباً، أود الاستفسار عن الشاليهات المتاحة" rows={2}
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none" dir="rtl" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">البريد الإلكتروني للدعم</label>
            <Input value={form.platform_email ?? ""} onChange={(e) => setForm((f) => ({ ...f, platform_email: e.target.value }))}
              placeholder="info@example.com" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="ltr" />
          </div>
          {(form.platform_whatsapp) && (
            <div className="bg-slate-900/60 border border-slate-600 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">معاينة رابط الواتساب:</p>
              <a href={`https://wa.me/${(form.platform_whatsapp).replace(/\D/g,"")}?text=${encodeURIComponent(form.whatsapp_message??"")}`}
                target="_blank" rel="noreferrer" className="text-[#25D366] break-all hover:underline">
                {`https://wa.me/${(form.platform_whatsapp).replace(/\D/g,"")}...`}
              </a>
            </div>
          )}
          <SaveBtn label="حفظ بيانات التواصل" />
        </div>
      </div>

      {/* ══ 3.5. WhatsApp Booking Message Template ══ */}
      <div className="bg-slate-800 rounded-xl border border-green-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-green-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <span className="text-[#25D366] text-xl leading-none">💬</span>
          <h3 className="text-slate-100 font-bold text-lg">قالب رسالة حجز الواتساب</h3>
          <span className="text-xs text-slate-500 mr-auto">تُرسَل عند الضغط على زر «احجز الآن»</span>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص القالب</label>
            <Textarea
              value={form.wa_message_template ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, wa_message_template: e.target.value }))}
              placeholder={`السلام عليكم، أريد حجز {chalet_name} عبر منصة شاليهات القصيم 🌴\nتفاصيل الحجز:\nاليوم: {day_name}\nالتاريخ الهجري: {hijri_date} هـ\nالتاريخ الميلادي: {gregorian_date} م\nالفترة: {period_name}\nالإجمالي: {total_price}\nهل الحجز متاح؟`}
              rows={9}
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-y font-mono text-sm leading-relaxed"
              dir="rtl"
            />
          </div>
          {/* Variable reference */}
          <div className="bg-slate-900/60 border border-slate-600 rounded-lg p-4 space-y-2">
            <p className="text-xs font-bold text-slate-300 mb-2">المتغيرات المتاحة (انسخ والصق في القالب):</p>
            <div className="flex flex-wrap gap-2">
              {[
                { tag: "{chalet_name}",    desc: "اسم الشاليه" },
                { tag: "{day_name}",       desc: "اسم اليوم" },
                { tag: "{hijri_date}",     desc: "التاريخ الهجري" },
                { tag: "{gregorian_date}", desc: "التاريخ الميلادي" },
                { tag: "{period_name}",    desc: "الفترة المختارة" },
                { tag: "{total_price}",    desc: "الإجمالي" },
              ].map(({ tag, desc }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, wa_message_template: (f.wa_message_template ?? "") + tag }))}
                  title={`إدراج: ${desc}`}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-green-900/40 border border-slate-600 hover:border-green-500 text-slate-300 hover:text-green-300 text-xs px-2.5 py-1.5 rounded-lg transition-all font-mono"
                >
                  <span className="text-green-400 font-bold">{tag}</span>
                  <span className="text-slate-500 text-[10px]">← {desc}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 pt-1">اضغط على أي متغير لإضافته تلقائياً في نهاية القالب. اترك الحقل فارغاً لاستخدام القالب الافتراضي.</p>
          </div>
          <SaveBtn label="حفظ قالب الرسالة" />
        </div>
      </div>

      {/* ══ 3.6. WhatsApp Review Message Template ══ */}
      <div className="bg-slate-800 rounded-xl border border-blue-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-blue-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <span className="text-[#25D366] text-xl leading-none">⭐</span>
          <h3 className="text-slate-100 font-bold text-lg">قالب رسالة تقييم الواتساب</h3>
          <span className="text-xs text-slate-500 mr-auto">تُرسَل عند إنشاء رابط التقييم للضيف</span>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص القالب</label>
            <Textarea
              value={form.wa_review_template ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, wa_review_template: e.target.value }))}
              placeholder="أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} 🌟&#10;اضغط هنا لتقييمك: {link}"
              rows={5}
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-y font-mono text-sm leading-relaxed"
              dir="rtl"
            />
          </div>
          <div className="bg-slate-900/60 border border-slate-600 rounded-lg p-4 space-y-2">
            <p className="text-xs font-bold text-slate-300 mb-2">المتغيرات المتاحة — اضغط للإدراج:</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, wa_review_template: (f.wa_review_template ?? "") + "{link}" }))}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-blue-900/40 border border-slate-600 hover:border-blue-500 text-slate-300 hover:text-blue-300 text-xs px-2.5 py-1.5 rounded-lg transition-all font-mono"
              >
                <span className="text-blue-400 font-bold">{"{link}"}</span>
                <span className="text-slate-500 text-[10px]">← رابط التقييم</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, wa_review_template: (f.wa_review_template ?? "") + "{guest_name}" }))}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-teal-900/40 border border-slate-600 hover:border-teal-500 text-slate-300 hover:text-teal-300 text-xs px-2.5 py-1.5 rounded-lg transition-all font-mono"
              >
                <span className="text-teal-400 font-bold">{"{guest_name}"}</span>
                <span className="text-slate-500 text-[10px]">← اسم الضيف</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, wa_review_template: (f.wa_review_template ?? "") + "{chalet_name}" }))}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-amber-900/40 border border-slate-600 hover:border-amber-500 text-slate-300 hover:text-amber-300 text-xs px-2.5 py-1.5 rounded-lg transition-all font-mono"
              >
                <span className="text-amber-400 font-bold">{"{chalet_name}"}</span>
                <span className="text-slate-500 text-[10px]">← اسم الشاليه</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 pt-1">
              استخدم هذه المتغيرات في أي مكان بالرسالة وستُستبدل تلقائياً. اترك الحقل فارغاً لاستخدام الرسالة الافتراضية.
            </p>
          </div>
          <SaveBtn label="حفظ قالب رسالة التقييم" />
        </div>
      </div>

      {/* ══ 3.7. Service Suggestion Button ══ */}
      <div className="bg-slate-800 rounded-xl border border-amber-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <span className="text-xl leading-none">🛎️</span>
          <h3 className="text-slate-100 font-bold text-lg">زر اقتراح الخدمات</h3>
          <span className="text-xs text-slate-500 mr-auto">يظهر أسفل زر الواتساب في صفحة الشاليه</span>
          {/* Master toggle */}
          <button
            onClick={() => setForm((f) => ({ ...f, svc_btn_enabled: f.svc_btn_enabled === "true" ? "false" : "true" }))}
            className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${form.svc_btn_enabled === "true" ? "bg-amber-500" : "bg-slate-600"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.svc_btn_enabled === "true" ? "right-0.5" : "left-0.5"}`} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص الزر</label>
            <Input
              value={form.svc_btn_label ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, svc_btn_label: e.target.value }))}
              placeholder="🛎️ تنسيق خدمات إضافية لمناسبتك (ذبائح، ضيافة...)"
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              dir="rtl"
            />
            <p className="text-[11px] text-slate-500">اترك الحقل فارغاً لاستخدام النص الافتراضي.</p>
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">لون الزر</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.svc_btn_color || "#b45309"}
                onChange={(e) => setForm((f) => ({ ...f, svc_btn_color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent p-0.5"
              />
              <div className="flex gap-2 flex-wrap">
                {["#b45309","#d97706","#0369a1","#7c3aed","#be123c","#15803d"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, svc_btn_color: c }))}
                    title={c}
                    style={{ background: c }}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.svc_btn_color === c ? "border-white scale-110" : "border-transparent"}`}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-400 font-mono">{form.svc_btn_color || "#b45309"}</span>
            </div>
          </div>

          {/* Live preview */}
          {form.svc_btn_enabled === "true" && (
            <div className="rounded-xl border border-slate-700 p-4 bg-slate-900/40 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">معاينة</p>
              <div
                style={{
                  width: "100%", height: 46, borderRadius: 14,
                  border: `2px solid ${form.svc_btn_color || "#b45309"}`,
                  background: "transparent",
                  color: form.svc_btn_color || "#b45309",
                  fontWeight: 700, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {form.svc_btn_label?.trim() || "🛎️ تنسيق خدمات إضافية لمناسبتك (ذبائح، ضيافة...)"}
              </div>
            </div>
          )}

          <SaveBtn label="حفظ إعدادات زر الخدمات" />
        </div>
      </div>

      {/* ══ 4. Social Media ══ */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-l from-purple-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Instagram className="w-5 h-5 text-purple-400" />
          <h3 className="text-slate-100 font-bold text-lg">وسائل التواصل الاجتماعي</h3>
          <span className="text-xs text-slate-500 mr-auto">فعّل/أوقف وأدخل الروابط</span>
        </div>
        <div className="p-6 space-y-3">
          <SocialToggleRow label="إنستقرام" urlKey="instagram_url" showKey="instagram_show"
            icon={<Instagram className="w-4 h-4 text-pink-400" />} form={form} setForm={setForm} />
          <SocialToggleRow label="تويتر / X" urlKey="twitter_url" showKey="twitter_show"
            icon={<Twitter className="w-4 h-4 text-sky-400" />} form={form} setForm={setForm} />
          <SocialToggleRow label="سناب شات" urlKey="snapchat_url" showKey="snapchat_show"
            icon={<span className="text-yellow-300 text-base leading-none">👻</span>} form={form} setForm={setForm} />
          <SocialToggleRow label="تيك توك" urlKey="tiktok_url" showKey="tiktok_show"
            icon={<span className="text-slate-200 text-base leading-none">🎵</span>} form={form} setForm={setForm} />
          <SaveBtn label="حفظ روابط التواصل" />
        </div>
      </div>

      {/* ══ 5. Brand & Appearance ══ */}
      <div className="bg-slate-800 rounded-xl border border-amber-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500/15 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Palette className="w-5 h-5 text-amber-400" />
          <h3 className="text-slate-100 font-bold text-lg">الهوية البصرية</h3>
        </div>
        <div className="p-6 space-y-5">
          {/* Logo Upload */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">شعار الموقع (Logo)</label>
            {form.site_logo_url && (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-slate-600 flex items-center justify-center">
                  <img src={form.site_logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, site_logo_url: "" }))}
                  className="text-slate-500 hover:text-red-400"><X className="w-4 h-4" /></Button>
              </div>
            )}
            <div className="flex gap-3 items-center">
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
              <label htmlFor="logo-upload" className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2 rounded-lg border border-slate-600 transition-colors flex items-center gap-2">
                <Upload className="w-4 h-4" />{logoUploading ? "جاري الرفع..." : "رفع الشعار"}
              </label>
            </div>
          </div>
          {/* Site Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">اسم الموقع (يظهر في القائمة العلوية)</label>
            <Input value={form.site_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, site_title: e.target.value }))}
              placeholder="شاليهات القصيم" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
          </div>
          {/* Primary Color */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">اللون الرئيسي</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.primary_color || "#d97706"}
                onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                className="w-11 h-11 rounded-lg cursor-pointer border-2 border-slate-600 bg-transparent p-0.5" />
              <Input value={form.primary_color ?? ""} onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                placeholder="#d97706" className="bg-slate-900 border-slate-600 text-white font-mono w-28" dir="ltr" maxLength={7} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, primary_color: c }))} title={c}
                  className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: c, borderColor: form.primary_color === c ? "white" : "transparent" }} />
              ))}
            </div>
          </div>
          <SaveBtn label="حفظ الهوية البصرية" />
        </div>
      </div>

      {/* ══ 5.5. Footer Branding ══ */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-l from-slate-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <MapPin className="w-5 h-5 text-slate-400" />
          <h3 className="text-slate-100 font-bold text-lg">هوية التذييل (Footer)</h3>
          <span className="text-xs text-slate-500 mr-auto">النصوص التي تظهر في أسفل كل صفحة</span>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">اسم الموقع في التذييل</label>
            <Input value={form.footer_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, footer_title: e.target.value }))}
              placeholder="شاليهات القصيم" className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
            <p className="text-xs text-slate-500">يُستخدم في التذييل بشكل مستقل عن اسم الموقع في القائمة العلوية.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">وصف قصير للموقع (التذييل)</label>
            <Textarea value={form.footer_desc ?? ""} onChange={(e) => setForm((f) => ({ ...f, footer_desc: e.target.value }))}
              placeholder="المنصة الأولى لحجز الشاليهات والاستراحات الفاخرة في منطقة القصيم. اكتشف أجمل الأماكن لقضاء أوقات لا تُنسى."
              rows={3} className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none" dir="rtl" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص حقوق النشر</label>
            <Input value={form.copyright_text ?? ""} onChange={(e) => setForm((f) => ({ ...f, copyright_text: e.target.value }))}
              placeholder="جميع الحقوق محفوظة." className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500" dir="rtl" />
            <p className="text-xs text-slate-500">يُضاف تلقائياً قبله: © {new Date().getFullYear()} + اسم التذييل.</p>
          </div>
          <SaveBtn label="حفظ هوية التذييل" />
        </div>
      </div>

      {/* ══ 6. Page Content Sections ══ */}
      {pageContentFields.map((field) => (
        <div key={field.key} className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-200 font-semibold text-base flex items-center gap-2">
              <span>{field.icon}</span>{field.label}
            </h3>
            <a href={field.path} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:text-amber-300 underline">معاينة الصفحة ↗</a>
          </div>
          <Textarea value={form[field.key] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
            placeholder={`اكتب محتوى ${field.label} هنا...`} rows={10}
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 text-sm leading-relaxed resize-y" dir="rtl" />
          <SaveBtn label={`حفظ ${field.label}`} />
        </div>
      ))}
    </div>
  );
}

/* ── Chalets Verification Tab ─────────────────── */
function ChaletsVerifyTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"active" | "pending" | "paused" | "deleted">("active");
  const [deleteChaletTarget, setDeleteChaletTarget] = useState<{ id: number; name: string } | null>(null);
  const [cityFilter, setCityFilter]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: chalets = [], isLoading } = useQuery<AdminChalet[]>({
    queryKey: ["admin", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/admin/chalets?includeStatus=true");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: pauseAlerts = [] } = useQuery<Array<{ chaletId: number; chaletName: string; pausedFrom: string; daysPaused: number; loggedAt: string }>>({
    queryKey: ["admin", "pause-alerts"],
    queryFn: async () => {
      const r = await apiFetch("/admin/pause-alerts");
      if (!r.ok) return [];
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

  const softDeleteChalet = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await apiFetch(`/admin/chalets/${id}/soft-delete`, { method: "PATCH", body: JSON.stringify({ reason }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "فشل الحذف"); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "chalets"] }); setDeleteChaletTarget(null); },
    onError: (e: Error) => alert(e.message),
  });

  const uniqueLocations = useMemo(() => {
    const seen = new Set<string>();
    return chalets.map((c) => c.location).filter((l) => { if (!l || seen.has(l)) return false; seen.add(l); return true; }).sort();
  }, [chalets]);

  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    return chalets.map((c) => c.category || c.propertyType || "").filter((v) => { if (!v || seen.has(v)) return false; seen.add(v); return true; }).sort();
  }, [chalets]);

  const filteredChalets = useMemo(() => chalets.filter((c) => {
    if ((c.adminStatus ?? "active") !== statusFilter) return false;
    if (cityFilter && c.location !== cityFilter) return false;
    if (categoryFilter && (c.category || c.propertyType || "") !== categoryFilter) return false;
    return true;
  }), [chalets, statusFilter, cityFilter, categoryFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
      </div>
    );
  }

  const statusLabels: Record<NonNullable<AdminChalet["adminStatus"]>, string> = {
    active: "نشطة",
    pending: "قيد المراجعة",
    paused: "موقوفة مؤقتاً",
    deleted: "محذوفة",
  };
  const statusStyles: Record<NonNullable<AdminChalet["adminStatus"]>, string> = {
    active: "bg-emerald-900/30 text-emerald-300 border-emerald-800",
    pending: "bg-amber-900/30 text-amber-300 border-amber-800",
    paused: "bg-orange-900/40 text-orange-300 border-orange-700",
    deleted: "bg-red-900/30 text-red-300 border-red-800",
  };
  const counts = {
    active: chalets.filter((c) => (c.adminStatus ?? "active") === "active").length,
    pending: chalets.filter((c) => c.adminStatus === "pending").length,
    paused: chalets.filter((c) => c.adminStatus === "paused").length,
    deleted: chalets.filter((c) => c.adminStatus === "deleted").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">إدارة ومراقبة الشاليهات</h2>
          <p className="text-slate-400 text-sm mt-1">{toAr(chalets.filter((c) => c.isVerified && c.id > 0).length)} موثق من أصل {toAr(chalets.filter((c) => c.id > 0).length)} شاليه منشور</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: "active" as const, label: "نشطة" },
            { id: "pending" as const, label: "قيد المراجعة" },
            { id: "paused" as const, label: "الشاليهات الموقوفة مؤقتاً" },
            { id: "deleted" as const, label: "محذوفة" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                statusFilter === tab.id
                  ? "border-amber-500 bg-amber-500/15 text-amber-200"
                  : "border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white hover:border-slate-500"
              }`}
            >
              {tab.label} ({toAr(counts[tab.id])})
            </button>
          ))}
        </div>
      </div>

      {/* ── City + Category filter row ── */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
          dir="rtl"
        >
          <option value="">جميع المدن</option>
          {uniqueLocations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
          dir="rtl"
        >
          <option value="">جميع الفئات</option>
          {uniqueCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        {(cityFilter || categoryFilter) && (
          <button
            type="button"
            onClick={() => { setCityFilter(""); setCategoryFilter(""); }}
            className="text-xs text-slate-400 hover:text-amber-400 border border-slate-600 hover:border-amber-500/50 rounded-lg px-3 py-2 transition-colors"
          >
            مسح الفلاتر ✕
          </button>
        )}
        <span className="text-slate-500 text-xs self-center">
          {toAr(filteredChalets.length)} نتيجة
        </span>
      </div>

      {pauseAlerts.length > 0 && (
        <div className="bg-orange-950/40 border border-orange-800 rounded-xl p-4 text-sm text-orange-100 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-300 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-orange-200">تنبيهات الشاليهات الموقوفة مؤقتاً</p>
            <p className="text-orange-100/75 text-xs mt-1">
              يوجد {toAr(pauseAlerts.length)} تنبيه مسجل لشاليهات بقيت موقوفة أكثر من ٧ أيام. آخر تنبيه: {pauseAlerts[0]?.chaletName} منذ {toAr(pauseAlerts[0]?.daysPaused ?? 0)} يوم.
            </p>
          </div>
        </div>
      )}

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
              <TableHead className="text-slate-300 text-right font-semibold">الإيقاف المؤقت</TableHead>
              <TableHead className="text-slate-300 text-center font-semibold">توثيق</TableHead>
              <TableHead className="text-slate-300 text-center font-semibold">حذف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredChalets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-400 py-12">لا توجد شاليهات ضمن هذا التصنيف</TableCell>
              </TableRow>
            ) : filteredChalets.map((c) => {
              const adminStatus = c.adminStatus ?? "active";
              return (
              <TableRow key={c.id} className="border-slate-700 hover:bg-slate-800/50 transition-colors">
                <TableCell className="font-semibold text-white">{c.nameAr}</TableCell>
                <TableCell className="text-slate-300 text-sm">
                  {c.location}
                  {c.district && <span className="text-slate-500"> · {c.district}</span>}
                </TableCell>
                <TableCell className="text-slate-400 text-sm">{c.category || c.propertyType || "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusStyles[adminStatus]}`}>
                    {statusLabels[adminStatus]}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {c.isPausedNow ? (
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-300 bg-orange-900/40 px-2.5 py-1 rounded-full border border-orange-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        موقوف منذ {toAr(c.pausedDays ?? 0)} يوم
                      </span>
                      <p className="text-xs text-slate-400">
                        من {fmtDate(c.pausedFrom)}{c.pausedUntil ? ` إلى ${fmtDate(c.pausedUntil)}` : " — بدون نهاية"}
                      </p>
                      {c.pauseAlert && <p className="text-xs text-orange-300 font-semibold">تنبيه: تجاوز ٧ أيام</p>}
                    </div>
                  ) : c.hiddenByOwner ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-300 bg-orange-900/40 px-2.5 py-1 rounded-full border border-orange-700">
                      مخفي من قبل المالك
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {c.id > 0 ? (
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
                  ) : (
                    <span className="text-xs text-slate-500">غير منشور</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {adminStatus !== "deleted" && c.id > 0 && (
                    <button
                      onClick={() => setDeleteChaletTarget({ id: c.id, name: c.nameAr })}
                      title="حذف ناعم"
                      className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
      </div>

      {deleteChaletTarget && (
        <DeleteSafeModal
          target={deleteChaletTarget}
          entityLabel="الشاليه"
          isLoading={softDeleteChalet.isPending}
          onClose={() => setDeleteChaletTarget(null)}
          onConfirm={(reason) => softDeleteChalet.mutate({ id: deleteChaletTarget.id, reason })}
        />
      )}
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
                    {toAr(photoIdx + 1)} / {toAr(allPhotos.length)}
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
                className="font-semibold text-green-600 hover:underline flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />{toAr(sub.whatsappNumber)}
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
          { id: "all",            label: `الكل (${toAr(submissions.length)})` },
          { id: "pending",        label: `معلق (${toAr(submissions.filter(s => s.status === "pending").length)})` },
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
                      {fmtDate(sub.createdAt)}
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
                    <span className="text-amber-400 font-bold">{toAr(Number(p.price).toLocaleString())}</span>
                    {" "}ر.س
                  </span>
                  <span>مدة: <span className="text-white font-semibold">{toAr(p.durationDays)}</span> يوم</span>
                  {p.trialDays > 0 && (
                    <span className="text-blue-400">تجريبي: {toAr(p.trialDays)} يوم</span>
                  )}
                  <span className="text-slate-500">ترتيب: {toAr(p.sortOrder)}</span>
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
        <DialogContent
          className="bg-slate-900 border-slate-700 text-white max-w-lg flex flex-col z-[200]"
          dir="rtl"
          style={{ maxHeight: 'min(calc(100dvh - 60px), 700px)', overflowY: 'auto' }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" />
              {editId ? "تعديل الخطة" : "إضافة خطة جديدة"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2 overflow-y-auto flex-1" style={{ paddingBottom: '100px' }}>
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
                  type="text"
                  inputMode="decimal"
                  placeholder="٩٩"
                  value={toAr(form.price)}
                  onChange={(e) => setForm({ ...form, price: fromAr(e.target.value) })}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">المدة (أيام) *</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="٣٠"
                  value={toAr(String(form.durationDays))}
                  onChange={(e) => setForm({ ...form, durationDays: Number(fromAr(e.target.value)) || 0 })}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">أيام تجريبية</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="٠"
                  value={toAr(String(form.trialDays))}
                  onChange={(e) => setForm({ ...form, trialDays: Number(fromAr(e.target.value)) || 0 })}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">ترتيب العرض</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="٠"
                  value={toAr(String(form.sortOrder))}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(fromAr(e.target.value)) || 0 })}
                  className="bg-slate-800 border-slate-600 text-white"
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

/* ══════════════════════════════════════════════════════════════
   Partner Applications Tab
   ══════════════════════════════════════════════════════════════ */
interface PartnerApp {
  id: number;
  full_name: string;
  business_name: string;
  business_type: "chalet" | "service" | "both";
  phone: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  docs_status: "pending_docs" | "docs_submitted" | "verified";
  email_verified: boolean;
  created_at: string;
}

const BUSINESS_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  chalet:  { label: "مالك شاليه",        className: "bg-green-900/40 text-green-300 border border-green-700/40" },
  service: { label: "مزود خدمة",         className: "bg-blue-900/40 text-blue-300 border border-blue-700/40" },
  both:    { label: "شاليه + خدمة",      className: "bg-purple-900/40 text-purple-300 border border-purple-700/40" },
};

const APP_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:  { label: "قيد الانتظار", className: "bg-amber-900/40 text-amber-300 border border-amber-700/40" },
  approved: { label: "مقبول",        className: "bg-green-900/40 text-green-300 border border-green-700/40" },
  rejected: { label: "مرفوض",       className: "bg-red-900/40 text-red-300 border border-red-700/40" },
};

const DOCS_STATUS_BADGE: Record<string, { label: string; icon: string; className: string }> = {
  pending_docs:   { label: "في انتظار المستندات", icon: "🕐", className: "bg-orange-900/40 text-orange-300 border border-orange-700/50" },
  docs_submitted: { label: "مستندات مرفوعة",      icon: "📋", className: "bg-blue-900/40 text-blue-300 border border-blue-700/50" },
  verified:       { label: "موثّق",                icon: "✅", className: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50" },
};

function PartnerApplicationsTab() {
  const qc = useQueryClient();
  const [apps, setApps]         = useState<PartnerApp[]>([]);
  const [loading, setLoading]   = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [docsUpdating, setDocsUpdating] = useState<number | null>(null);
  const [verifying, setVerifying] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/admin/applications`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setApps(Array.isArray(d) ? d : (d?.rows ?? [])))
      .finally(() => setLoading(false));
  }, []);

  async function setStatus(id: number, status: "approved" | "rejected" | "pending") {
    setUpdating(id);
    await fetch(`${API}/admin/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    setUpdating(null);
    /* Refresh owners dropdown in DirectAddTab immediately after approval */
    if (status === "approved") {
      qc.invalidateQueries({ queryKey: ["admin", "owners"] });
    }
  }

  async function setDocsStatus(id: number, docs_status: PartnerApp["docs_status"]) {
    setDocsUpdating(id);
    await fetch(`${API}/admin/applications/${id}/docs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ docs_status }),
    });
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, docs_status } : a)));
    setDocsUpdating(null);
  }

  async function manualVerify(id: number) {
    setVerifying(id);
    await fetch(`${API}/admin/applications/${id}/manual-verify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, email_verified: true } : a)));
    setVerifying(null);
    /* Refresh owners dropdown — a manually-verified + approved owner becomes eligible */
    qc.invalidateQueries({ queryKey: ["admin", "owners"] });
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
    </div>
  );

  const pending  = apps.filter((a) => a.status === "pending");
  const reviewed = apps.filter((a) => a.status !== "pending");

  function AppCard({ app }: { app: PartnerApp }) {
    const typeBadge   = BUSINESS_TYPE_BADGE[app.business_type] ?? BUSINESS_TYPE_BADGE.chalet;
    const statusBadge = APP_STATUS_BADGE[app.status]           ?? APP_STATUS_BADGE.pending;
    const docsBadge   = DOCS_STATUS_BADGE[app.docs_status]     ?? DOCS_STATUS_BADGE.pending_docs;
    const { hijri, gregorian } = formatDualDate(app.created_at);
    const isDocsUpdating = docsUpdating === app.id;

    const nextDocsStatus: Record<PartnerApp["docs_status"], PartnerApp["docs_status"]> = {
      pending_docs:   "docs_submitted",
      docs_submitted: "verified",
      verified:       "pending_docs",
    };

    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-100 text-sm">{app.full_name}</p>
            <p className="text-slate-400 text-xs mt-0.5">{app.business_name}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${typeBadge.className}`}>
              {typeBadge.label}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
          </div>
        </div>

        {/* Verification status badge */}
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border ${docsBadge.className}`}>
            <span>{docsBadge.icon}</span>
            <span>{docsBadge.label}</span>
          </span>
          <button
            disabled={isDocsUpdating}
            onClick={() => setDocsStatus(app.id, nextDocsStatus[app.docs_status ?? "pending_docs"])}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50 underline underline-offset-2"
          >
            {isDocsUpdating ? "…" : "تغيير"}
          </button>
        </div>

        {/* Email verification status */}
        <div className="flex items-center justify-between gap-2">
          {app.email_verified ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-green-900/30 text-green-300 border-green-700/40">
              ✓ تم التحقق من البريد
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border bg-amber-900/30 text-amber-300 border-amber-700/40">
              ⏳ في انتظار التحقق من البريد
            </span>
          )}
          {!app.email_verified && (
            <button
              disabled={verifying === app.id}
              onClick={() => manualVerify(app.id)}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 underline underline-offset-2 whitespace-nowrap"
            >
              {verifying === app.id ? "…" : "تحقق يدوي"}
            </button>
          )}
        </div>

        <div className="text-xs text-slate-400 space-y-0.5">
          <p dir="ltr" className="text-left">{app.email}</p>
          <p dir="ltr" className="text-left">{app.phone}</p>
          <p className="text-slate-500">
            <span>{hijri}</span>
            <span className="mx-1 opacity-40">·</span>
            <span dir="ltr" className="inline">{gregorian}</span>
          </p>
        </div>
        {app.status === "pending" && (
          <div className="flex gap-2 pt-1">
            <button
              disabled={updating === app.id}
              onClick={() => setStatus(app.id, "approved")}
              className="flex-1 h-8 rounded-lg bg-green-700/60 hover:bg-green-700 text-green-200 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {updating === app.id ? "…" : "قبول الطلب"}
            </button>
            <button
              disabled={updating === app.id}
              onClick={() => setStatus(app.id, "rejected")}
              className="flex-1 h-8 rounded-lg bg-red-800/50 hover:bg-red-700/70 text-red-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              رفض
            </button>
          </div>
        )}
        {app.status !== "pending" && (
          <button
            onClick={() => setStatus(app.id, "pending")}
            className="w-full h-7 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 text-xs transition-colors"
          >
            إعادة للانتظار
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">طلبات الانضمام كشريك</h2>
          <p className="text-xs text-slate-500 mt-1">
            الطلبات: تسجيل الحساب الأولي · التوثيق: رفع المستندات الرسمية (الهوية، الصك، الترخيص)
          </p>
        </div>
        <span className="text-xs text-slate-500 shrink-0">{Math.round(apps.length).toLocaleString("ar-SA")} طلب</span>
      </div>

      {/* Verification legend */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {Object.entries(DOCS_STATUS_BADGE).map(([k, v]) => (
          <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${v.className}`}>
            {v.icon} {v.label}
          </span>
        ))}
      </div>

      {apps.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">لا توجد طلبات بعد</div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            قيد الانتظار ({Math.round(pending.length).toLocaleString("ar-SA")})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((a) => <AppCard key={a.id} app={a} />)}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3">
            تمت المراجعة ({Math.round(reviewed.length).toLocaleString("ar-SA")})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reviewed.map((a) => <AppCard key={a.id} app={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Platform Budget Tab — Subscriptions − Expenses = Net Profit
   ══════════════════════════════════════════════════════════════ */
interface PlatformExpense { id: number; dateStr: string; category: string; amount: number; notes: string }
interface PlatformRevenueData {
  totalSubscriptionRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalSubscriptions: number;
  subscriptionBreakdown: { plan: string; count: number; planPrice: number; total: number }[];
  subscriptionsByStatus: { status: string; count: string }[];
  platformExpenses: PlatformExpense[];
}

function PlatformRevenueTab() {
  const qc = useQueryClient();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expForm, setExpForm] = useState({ dateStr: "", category: "", amount: "", notes: "" });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<PlatformRevenueData>({
    queryKey: ["admin", "platform-revenue"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/platform-revenue`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const addExpense = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/admin/platform-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...expForm, amount: Number(expForm.amount) }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "platform-revenue"] });
      setExpForm({ dateStr: "", category: "", amount: "", notes: "" });
      setShowAddExpense(false);
    },
  });

  async function deleteExpense(id: number) {
    setDeletingId(id);
    await fetch(`${API}/admin/platform-expenses/${id}`, { method: "DELETE", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["admin", "platform-revenue"] });
    setDeletingId(null);
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
    </div>
  );

  const d = data!;
  const fmtN = (n: number) => toAr(Math.round(n).toLocaleString());

  const planLabels: Record<string, string> = {
    monthly: "شهري", yearly: "سنوي",
    chalet_basic: "أساسي", chalet_pro: "متقدم", chalet_unlimited: "غير محدود",
    service_basic: "خدمات - أساسي", service_pro: "خدمات - متقدم",
  };
  const statusLabels: Record<string, string> = {
    active: "نشط", expired: "منتهي", trial: "تجريبي", inactive: "غير نشط", canceled: "ملغى",
  };
  const netIsPos = d.netProfit >= 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-amber-400" />
          ميزانية المنصة
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إيرادات الاشتراكات ← مصروفات المنصة → صافي الربح
        </p>
      </div>

      {/* ── Equation KPI Bar ── */}
      <div className="grid grid-cols-3 gap-0 bg-slate-800/70 border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Subscriptions */}
        <div className="p-4 border-l border-slate-700/50 space-y-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">إيرادات الاشتراكات</p>
          <p className="text-xl font-bold text-emerald-300">{fmtN(d.totalSubscriptionRevenue)} <span className="text-xs font-normal">ر.س</span></p>
          <p className="text-[10px] text-slate-500">{fmtN(d.totalSubscriptions)} اشتراك</p>
        </div>
        {/* Expenses */}
        <div className="p-4 border-l border-slate-700/50 space-y-1">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">مصروفات المنصة</p>
          <p className="text-xl font-bold text-red-300">− {fmtN(d.totalExpenses)} <span className="text-xs font-normal">ر.س</span></p>
          <p className="text-[10px] text-slate-500">{fmtN(d.platformExpenses.length)} بند مصروف</p>
        </div>
        {/* Net Profit */}
        <div className={`p-4 space-y-1 ${netIsPos ? "bg-emerald-900/20" : "bg-red-900/20"}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">صافي الربح</p>
          <p className={`text-xl font-bold ${netIsPos ? "text-amber-300" : "text-red-400"}`}>
            = {fmtN(Math.abs(d.netProfit))} <span className="text-xs font-normal">ر.س</span>
            {!netIsPos && <span className="text-xs text-red-400 mr-1">(خسارة)</span>}
          </p>
          <p className="text-[10px] text-slate-500">الرصيد الصافي</p>
        </div>
      </div>

      {/* ── Subscription breakdown ── */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">تفصيل الاشتراكات حسب الخطة</h3>
          </div>
          <div className="flex gap-2">
            {d.subscriptionsByStatus.map((s) => (
              <span key={s.status} className="text-[10px] bg-slate-700/60 rounded-lg px-2 py-1 text-slate-400">
                {statusLabels[s.status] ?? s.status}: {Number(s.count).toLocaleString("ar-SA")}
              </span>
            ))}
          </div>
        </div>
        {d.subscriptionBreakdown.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">لا توجد اشتراكات مدفوعة بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-500">
                  <th className="text-right py-2 font-medium">الخطة</th>
                  <th className="text-center py-2 font-medium">العدد</th>
                  <th className="text-center py-2 font-medium">سعر الخطة</th>
                  <th className="text-left py-2 font-medium text-emerald-400">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {d.subscriptionBreakdown.map((row) => (
                  <tr key={row.plan} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="py-2 font-medium">{planLabels[row.plan] ?? row.plan}</td>
                    <td className="py-2 text-center">{fmtN(row.count)}</td>
                    <td className="py-2 text-center">{fmtN(row.planPrice)} ر.س</td>
                    <td className="py-2 text-left text-emerald-400 font-semibold">{fmtN(row.total)} ر.س</td>
                  </tr>
                ))}
                <tr className="font-bold text-slate-200 border-t border-slate-600">
                  <td className="py-2">الإجمالي</td>
                  <td className="py-2 text-center">{fmtN(d.totalSubscriptions)}</td>
                  <td className="py-2" />
                  <td className="py-2 text-left text-emerald-300 text-sm">{fmtN(d.totalSubscriptionRevenue)} ر.س</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Platform Expenses ── */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-bold text-slate-200">مصروفات المنصة</h3>
          </div>
          <button
            onClick={() => setShowAddExpense((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            إضافة مصروف
          </button>
        </div>

        {/* Add expense form */}
        {showAddExpense && (
          <div className="bg-slate-900/60 border border-slate-600/50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-medium">التاريخ *</label>
                <DualDatePicker
                  value={expForm.dateStr}
                  onChange={(v) => setExpForm((f) => ({ ...f, dateStr: v }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-medium">المبلغ (ر.س) *</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="٠"
                  value={toAr(expForm.amount)}
                  onChange={(e) => setExpForm((f) => ({ ...f, amount: fromAr(e.target.value) }))}
                  className="bg-slate-800 border-slate-600 text-slate-100 text-xs h-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-medium">البند / الفئة *</label>
              <Input
                placeholder="مثال: استضافة، تسويق، رسوم دفع..."
                value={expForm.category}
                onChange={(e) => setExpForm((f) => ({ ...f, category: e.target.value }))}
                className="bg-slate-800 border-slate-600 text-slate-100 text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-medium">ملاحظات</label>
              <Input
                placeholder="تفاصيل اختيارية..."
                value={expForm.notes}
                onChange={(e) => setExpForm((f) => ({ ...f, notes: e.target.value }))}
                className="bg-slate-800 border-slate-600 text-slate-100 text-xs h-8"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => addExpense.mutate()}
                disabled={!expForm.dateStr || !expForm.category || !expForm.amount || addExpense.isPending}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs"
              >
                {addExpense.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "حفظ المصروف"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddExpense(false)} className="text-xs text-slate-400">
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* Expenses list */}
        {d.platformExpenses.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">لا توجد مصروفات مسجّلة بعد</p>
        ) : (
          <div className="space-y-2">
            {d.platformExpenses.map((exp) => {
              const { hijri, gregorian } = formatDualDate(exp.dateStr);
              return (
                <div key={exp.id} className="flex items-center justify-between bg-slate-900/40 rounded-xl px-3 py-2.5 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{exp.category}</p>
                    {exp.notes && <p className="text-[10px] text-slate-500 mt-0.5">{exp.notes}</p>}
                    <p className="text-[10px] text-slate-600 mt-0.5">{hijri} · <span dir="ltr" className="inline">{gregorian}</span></p>
                  </div>
                  <p className="text-sm font-bold text-red-300 shrink-0">{fmtN(exp.amount)} ر.س</p>
                  <button
                    onClick={() => deleteExpense(exp.id)}
                    disabled={deletingId === exp.id}
                    className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {deletingId === exp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
            {/* Total row */}
            <div className="flex items-center justify-between bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2">
              <p className="text-xs font-bold text-slate-300">إجمالي المصروفات</p>
              <p className="text-sm font-bold text-red-300">{fmtN(d.totalExpenses)} ر.س</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Subscriptions by status (compact) ── */}
      {d.subscriptionsByStatus.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-200">الاشتراكات حسب الحالة</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {d.subscriptionsByStatus.map((s) => (
              <div key={s.status} className="bg-slate-700/40 rounded-xl px-3 py-2 text-center min-w-[90px]">
                <p className="text-lg font-bold text-slate-100">{Number(s.count).toLocaleString("ar-SA")}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{statusLabels[s.status] ?? s.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zero-state */}
      {d.totalSubscriptions === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">
          <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
          لا توجد اشتراكات مدفوعة بعد
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Overview / Analytics Tab — charts & KPIs
   ══════════════════════════════════════════════════════════════ */
interface AnalyticsData {
  monthlyRevenue: { month: string; total: number }[];
  marketDistribution: { chalets: number; services: number };
  geographicData: { city: string; count: number }[];
  accountStatus: { status: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  active:   "نشط",
  inactive: "غير نشط",
  expired:  "منتهي",
  trial:    "تجريبي",
  canceled: "ملغى",
  no_sub:   "بدون اشتراك",
};

const MONTH_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل","05":"مايو","06":"يونيو",
  "07":"يوليو","08":"أغسطس","09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

const CHART_COLORS = ["#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#ec4899"];

function OverviewTab() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["admin", "analytics"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/analytics`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 flex-col gap-3">
      <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
      <p className="text-slate-500 text-sm">جارٍ تحميل الإحصائيات…</p>
    </div>
  );
  if (!data) return (
    <div className="flex items-center justify-center py-24 flex-col gap-3">
      <BarChart3 className="w-10 h-10 text-slate-600" />
      <p className="text-slate-400 text-sm font-medium">تعذّر تحميل الإحصائيات</p>
      <p className="text-slate-600 text-xs">يُرجى إعادة تحميل الصفحة أو التواصل مع الدعم الفني</p>
    </div>
  );

  const d = data;
  const fmtN = (n: number) => toAr(Math.round(n).toLocaleString());

  // Prepare monthly revenue with Arabic month labels
  const revenueData = d.monthlyRevenue.map(r => ({
    ...r,
    label: MONTH_AR[r.month.split("-")[1]] ?? r.month,
    totalLabel: `${fmtN(r.total)} ر.س`,
  }));

  // Pie data for market distribution
  const marketPie = [
    { name: "شاليهات", value: d.marketDistribution.chalets },
    { name: "خدمات مناسبات", value: d.marketDistribution.services },
  ];

  // Account status pie
  const statusPie = d.accountStatus.map(s => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    value: s.count,
  }));

  const totalUnits = d.marketDistribution.chalets + d.marketDistribution.services;
  const totalAccounts = d.accountStatus.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-400" />
          لوحة الإحصائيات
        </h2>
        <p className="text-xs text-slate-500 mt-1">نظرة شاملة على أداء المنصة</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الشاليهات", value: fmtN(d.marketDistribution.chalets), icon: <Home className="w-4 h-4 text-amber-400" /> },
          { label: "الخدمات المسجّلة", value: fmtN(d.marketDistribution.services), icon: <Wrench className="w-4 h-4 text-blue-400" /> },
          { label: "الحسابات النشطة", value: fmtN(d.accountStatus.find(s => s.status === "active")?.count ?? 0), icon: <CheckCircle className="w-4 h-4 text-emerald-400" /> },
          { label: "إيرادات الاشتراكات", value: `${fmtN(d.monthlyRevenue.reduce((s, r) => s + r.total, 0))} ر.س`, icon: <TrendingUp className="w-4 h-4 text-amber-400" /> },
        ].map(k => (
          <div key={k.label} className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">{k.icon}<span className="text-[10px] text-slate-500">{k.label}</span></div>
            <p className="text-xl font-bold text-slate-100">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Row 1: Revenue Growth + Market Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Growth Line Chart */}
        <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            نمو إيرادات الاشتراكات (آخر ١٢ شهرًا)
          </h3>
          {revenueData.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">لا توجد بيانات إيرادات بعد</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v: number) => toAr(String(v))} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }}
                  formatter={(v: number) => [`${fmtN(v)} ر.س`, "الإيراد"]}
                  labelStyle={{ color: "#f59e0b" }}
                />
                <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Market Distribution Pie */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            توزيع السوق
          </h3>
          {totalUnits === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">لا توجد بيانات</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={marketPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {marketPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {marketPie.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-slate-400">{item.name}</span>
                    </div>
                    <span className="font-semibold text-slate-200">{fmtN(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Geographic Bar + Account Status Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Geographic Heatmap Bar Chart */}
        <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-400" />
            حجم الحجوزات حسب المدينة
          </h3>
          {d.geographicData.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">لا توجد بيانات حجوزات بعد</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.geographicData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="city" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} tickFormatter={(v: number) => toAr(String(v))} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }}
                  formatter={(v: number) => [fmtN(v), "حجز"]}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {d.geographicData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Account Status Pie */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            حالة الحسابات
          </h3>
          {totalAccounts === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">لا توجد بيانات</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {statusPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {statusPie.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-slate-400">{item.name}</span>
                    </div>
                    <span className="font-semibold text-slate-200">{fmtN(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   DirectAdd Tab — admin directly creates a chalet or service provider
   under a chosen owner, bypassing the submission review flow.
   ══════════════════════════════════════════════════════════════ */
const DA_PROPERTY_TYPES = [
  { value: "شالية",    label: "🏕️ شالية" },
  { value: "مزرعة",   label: "🌿 مزرعة" },
  { value: "استراحة", label: "🏡 استراحة" },
  { value: "مخيم",    label: "⛺ مخيم" },
];
const DA_SECTIONS_OPTS = [
  { value: "قسم واحد",      label: "🔑 قسم واحد" },
  { value: "قسمين منفصلة", label: "🔑🔑 قسمين منفصلة" },
];
const DA_DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const DA_DEFAULT_TERMS = "يمنع التدخين داخل العقار\nوقت تسجيل الخروج الساعة ١٠:٠٠ صباحاً\nيمنع إحضار الحيوانات الأليفة\nالضيوف المسموح بهم فقط كما هو محدد عند الحجز\nأي أضرار تلحق بالمكان تُحسب على الضيف";
const DA_SERVICE_DEFAULT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='32' fill='%231e293b'/%3E%3Ccircle cx='80' cy='80' r='48' fill='%23f59e0b' opacity='.18'/%3E%3Cpath d='M48 98V72l32-22 32 22v26l-32 18-32-18Zm32-27 22 15v-9L80 62 58 77v9l22-15Z' fill='%23fbbf24'/%3E%3C/svg%3E";
type DA_DayRow = { morning: string; evening: string; fullday: string };
const daInitGrid = (): Record<number, DA_DayRow> =>
  Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, { morning: "", evening: "", fullday: "" }]));

async function daUploadFile(file: File, type: "image" | "video"): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("type", type);
  const r = await fetch(`${BASE}/api/storage/uploads/process`, { method: "POST", body: fd, credentials: "include" });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.url ?? d.originalUrl ?? null;
}

/* ── Searchable owner picker (replaces plain Select) ───────── */
interface OwnerOption { ownerId: string; ownerName: string; whatsappNumber: string; }

function OwnerPickerInput({
  owners,
  value,
  onChange,
}: {
  owners: OwnerOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef<HTMLDivElement>(null);

  const selected = owners.find((o) => o.ownerId === value);

  /* Alphabetically sorted + filtered */
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return owners
      .filter((o) =>
        !q ||
        o.ownerName.toLowerCase().includes(q) ||
        o.whatsappNumber.includes(q)
      )
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName, "ar"));
  }, [owners, query]);

  /* Close on outside click */
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function pick(owner: OwnerOption) {
    onChange(owner.ownerId);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input shows selected label or search query */}
      <div className="relative">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          value={open ? query : selected ? `${selected.ownerName} — ${toAr(selected.whatsappNumber)}` : ""}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(""); setOpen(true); }}
          placeholder="ابحث باسم المالك أو رقم الجوال..."
          className="w-full bg-slate-900 border border-slate-600 rounded-lg text-sm text-white pr-9 pl-9 py-2.5 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {options.length === 0 && (
              <div className="px-4 py-3 text-slate-400 text-sm text-center">لا توجد نتائج</div>
            )}
            {options.map((o) => (
              <button
                key={o.ownerId}
                type="button"
                onClick={() => pick(o)}
                className={`w-full text-right flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-800 transition-colors ${
                  o.ownerId === value ? "bg-amber-500/10 text-amber-300" : "text-white"
                }`}
              >
                <span className="font-medium">{o.ownerName}</span>
                <span className="text-slate-400 text-xs font-mono ltr">{toAr(o.whatsappNumber)}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-700 px-3 py-1.5 text-[10px] text-slate-500 text-left">
            {toAr(options.length)} نتيجة
          </div>
        </div>
      )}
    </div>
  );
}

type DirectAddMode = "property" | "owner" | "service";

function normalizeOwnerPhone(value: string): string {
  let digits = fromAr(value).replace(/\D/g, "");
  if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits ? `0${digits}` : "";
}

function DirectAddTab({ mode }: { mode: DirectAddMode }) {
  const qc = useQueryClient();
  const ownerOnly = mode === "owner";

  const { data: daCategories = [] } = useQuery<{ id: number; nameAr: string; emoji: string }[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const r = await fetch(`${API}/categories`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const photoInputRef    = useRef<HTMLInputElement>(null);
  const videoInputRef    = useRef<HTMLInputElement>(null);
  const logoInputRef     = useRef<HTMLInputElement>(null);
  const galleryInputRef  = useRef<HTMLInputElement>(null);
  const svcVideoInputRef = useRef<HTMLInputElement>(null);

  const [assetType, setAssetType] = useState<"chalet" | "service">(mode === "service" ? "service" : "chalet");

  /* ── Owner ── */
  const [ownerId, setOwnerId]             = useState("");
  const [showNewOwner, setShowNewOwner]   = useState(mode === "owner");
  const [newOwner, setNewOwner]           = useState({ fullName: "", phone: "", email: "", password: "", confirmPassword: "" });
  const [showNewOwnerPw, setShowNewOwnerPw]   = useState(false);
  const [showNewOwnerCPw, setShowNewOwnerCPw] = useState(false);
  const [registeringOwner, setRegisteringOwner] = useState(false);
  const [ownerRegErr, setOwnerRegErr]     = useState<string | null>(null);
  const [ownerRegOk, setOwnerRegOk]       = useState<string | null>(null);

  /* ── Chalet fields ── */
  const [cForm, setCForm] = useState({
    nameAr: "", location: "", district: "", whatsapp: "",
    price: "", priceMorning: "", priceEvening: "", priceFullDay: "",
    descriptionAr: "", mapsUrl: "", socialLink: "",
    termsAndConditions: DA_DEFAULT_TERMS,
  });
  const [propertyType,    setPropertyType]    = useState("");
  const [sections,        setSections]        = useState("");
  const [hasBedrooms,     setHasBedrooms]     = useState(false);
  const [bedroomCount,    setBedroomCount]    = useState("");
  const [maxGuests,       setMaxGuests]       = useState("");
  const [slotMorning,     setSlotMorning]     = useState(true);
  const [slotEvening,     setSlotEvening]     = useState(true);
  const [slotFullDay,     setSlotFullDay]     = useState(true);
  const [morningCheckIn,  setMorningCheckIn]  = useState("");
  const [morningCheckOut, setMorningCheckOut] = useState("");
  const [eveningCheckIn,  setEveningCheckIn]  = useState("");
  const [eveningCheckOut, setEveningCheckOut] = useState("");
  const [fullDayCheckIn,  setFullDayCheckIn]  = useState("");
  const [fullDayCheckOut, setFullDayCheckOut] = useState("");
  const [seasonalDisclaimer, setSeasonalDisclaimer] = useState(true);
  const [dailyPriceGrid,  setDailyPriceGrid] = useState<Record<number, DA_DayRow>>(daInitGrid());
  const [selectedAmenities, setSelectedAmenities] = useState<Set<string>>(new Set());
  const [customAmenityTags, setCustomAmenityTags] = useState<string[]>([]);
  const [customAmenityInput, setCustomAmenityInput] = useState("");
  const [chaletPhotos,   setChaletPhotos]  = useState<string[]>([]);
  const [chaletVideo,    setChaletVideo]   = useState<string | null>(null);
  const [legalAccepted,  setLegalAccepted] = useState(false);
  const [uploadingCPh,   setUploadingCPh]  = useState(false);
  const [uploadingCVid,  setUploadingCVid] = useState(false);

  /* ── Service fields ── */
  const [sForm, setSForm] = useState({
    businessName: "", city: "", category: "", whatsapp: "",
    yearsOfExperience: "", descriptionAr: "",
  });
  const [coverageTags,      setCoverageTags]      = useState<string[]>([]);
  const [customServiceCategory, setCustomServiceCategory] = useState("");
  const [coverageCityInput, setCoverageCityInput] = useState("");
  const [showCoverageCityInput, setShowCoverageCityInput] = useState(false);
  const [customFeatureTags, setCustomFeatureTags] = useState<string[]>([]);
  const [customFeatureInput, setCustomFeatureInput] = useState("");
  const [svcLogoUrl,  setSvcLogoUrl]  = useState<string | null>(null);
  const [svcGallery,  setSvcGallery]  = useState<string[]>([]);
  const [svcVideo,    setSvcVideo]    = useState<string | null>(null);
  const [svcLegal,    setSvcLegal]    = useState(false);
  const [uploadingLogo, setUploadingLogo]   = useState(false);
  const [uploadingGal,  setUploadingGal]   = useState(false);
  const [uploadingSVid, setUploadingSVid]  = useState(false);

  /* ── Custom city "other" state ── */
  const [cCitySelectVal,     setCCitySelectVal]     = useState("");
  const [cCustomCity,        setCCustomCity]        = useState("");
  const [sCitySelectVal,     setSCitySelectVal]     = useState("");
  const [sCustomCity,        setSCustomCity]        = useState("");

  /* ── District dropdown (chalet) ── */
  const [cSelectedCityId,    setCSelectedCityId]    = useState<number | null>(null);
  const [cDistrictSelectVal, setCDistrictSelectVal] = useState("");
  const [cCustomDistrict,    setCCustomDistrict]    = useState("");

  /* ── UI state ── */
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: owners = [] } = useQuery<OwnerOption[]>({
    queryKey: ["admin", "owners"],
    queryFn: async () => {
      const r = await apiFetch("/admin/owners");
      return r.ok ? r.json() : [];
    },
  });

  const { data: cities = [] } = useQuery<City[]>({
    queryKey: ["admin", "cities"],
    queryFn: async () => { const r = await apiFetch("/admin/cities"); return r.ok ? r.json() : []; },
  });
  const { data: daDistricts = [] } = useQuery<{ id: number; name: string; cityId: number }[]>({
    queryKey: ["catalog", "districts", cSelectedCityId],
    queryFn: async () => {
      const url = cSelectedCityId ? `/api/districts?cityId=${cSelectedCityId}` : "/api/districts";
      const r = await fetch(`${BASE}${url}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: true,
    staleTime: 60_000,
  });
  const { data: serviceCategories = [] } = useQuery<ServiceCat[]>({
    queryKey: ["admin", "service-categories"],
    queryFn: async () => { const r = await apiFetch("/admin/service-categories"); return r.ok ? r.json() : []; },
  });
  const { data: amenities = [] } = useQuery<{ id: number; key: string; labelAr: string }[]>({
    queryKey: ["admin", "amenities"],
    queryFn: async () => { const r = await apiFetch("/admin/amenities"); return r.ok ? r.json() : []; },
  });

  function resetAll() {
    setCForm({ nameAr:"", location:"", district:"", whatsapp:"", price:"", priceMorning:"", priceEvening:"", priceFullDay:"", descriptionAr:"", mapsUrl:"", socialLink:"", termsAndConditions: DA_DEFAULT_TERMS });
    setPropertyType(""); setSections(""); setHasBedrooms(false); setBedroomCount(""); setMaxGuests("");
    setSlotMorning(true); setSlotEvening(true); setSlotFullDay(true);
    setMorningCheckIn(""); setMorningCheckOut(""); setEveningCheckIn(""); setEveningCheckOut(""); setFullDayCheckIn(""); setFullDayCheckOut("");
    setSeasonalDisclaimer(true); setDailyPriceGrid(daInitGrid());
    setSelectedAmenities(new Set()); setCustomAmenityTags([]); setCustomAmenityInput("");
    setChaletPhotos([]); setChaletVideo(null); setLegalAccepted(false);
    setCCitySelectVal(""); setCCustomCity(""); setSCitySelectVal(""); setSCustomCity("");
    setCSelectedCityId(null); setCDistrictSelectVal(""); setCCustomDistrict("");
    setSForm({ businessName:"", city:"", category:"", whatsapp:"", yearsOfExperience:"", descriptionAr:"" });
    setCoverageTags([]); setCustomServiceCategory(""); setCoverageCityInput(""); setShowCoverageCityInput(false);
    setCustomFeatureTags([]); setCustomFeatureInput("");
    setSvcLogoUrl(null); setSvcGallery([]); setSvcVideo(null); setSvcLegal(false);
    setError(null); setSuccess(null);
  }

  useEffect(() => {
    setAssetType(mode === "service" ? "service" : "chalet");
    resetAll();
    setShowNewOwner(ownerOnly);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // The add menu intentionally starts each form with fresh values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleRegisterOwner(e: React.MouseEvent) {
    e.preventDefault();
    setOwnerRegErr(null); setOwnerRegOk(null);
    if (!newOwner.fullName.trim()) { setOwnerRegErr("الاسم الكامل مطلوب"); return; }
    if (!newOwner.phone.trim())    { setOwnerRegErr("رقم الجوال مطلوب"); return; }
    if (newOwner.password.length < 6) { setOwnerRegErr("كلمة المرور يجب أن تكون ٦ أحرف على الأقل"); return; }
    if (newOwner.password !== newOwner.confirmPassword) { setOwnerRegErr("كلمتا المرور غير متطابقتين"); return; }
    const phone = normalizeOwnerPhone(newOwner.phone);
    setRegisteringOwner(true);
    try {
      const r = await apiFetch("/register-owner", { method: "POST", body: JSON.stringify({
        fullName: newOwner.fullName.trim(),
        phone,
        email: newOwner.email.trim() || undefined,
        password: newOwner.password
      }) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { setOwnerRegErr(json.error ?? "حدث خطأ أثناء التسجيل"); }
      else {
        setOwnerRegOk(newOwner.email.trim()
          ? `✓ تم تسجيل "${newOwner.fullName}" بنجاح — سيظهر في قائمة الطلبات بعد تحقق البريد الإلكتروني`
          : `✓ تم تسجيل "${newOwner.fullName}" بنجاح — رقم الجوال هو المعرّف الرئيسي للحساب`);
        setNewOwner({ fullName:"", phone:"", email:"", password:"", confirmPassword:"" });
        setShowNewOwner(false);
        qc.invalidateQueries({ queryKey: ["admin","owners"] });
      }
    } catch { setOwnerRegErr("فشل الاتصال بالخادم، يرجى المحاولة مرة أخرى"); }
    finally { setRegisteringOwner(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!ownerId) { setError("يجب اختيار المالك"); return; }
    const resolvedServiceCategory = sForm.category === "__other__"
      ? customServiceCategory.trim()
      : sForm.category;

    /* ── Resolve custom cities ── */
    let resolvedCLocation = cCitySelectVal === "__other__" ? "" : cForm.location;
    if (cCitySelectVal === "__other__") {
      const trimmed = cCustomCity.trim();
      if (!trimmed) { setError("يجب إدخال اسم المدينة للعقار"); return; }
      try {
        const r = await apiFetch("/cities", { method: "POST", body: JSON.stringify({ name: trimmed }) });
        const city = await r.json();
        resolvedCLocation = city.name ?? trimmed;
      } catch { resolvedCLocation = trimmed; }
    }
    let resolvedSCity = sCitySelectVal === "__other__" ? "" : sForm.city;
    if (sCitySelectVal === "__other__") {
      const trimmed = sCustomCity.trim();
      if (!trimmed) { setError("يجب إدخال اسم المدينة للخدمة"); return; }
      try {
        const r = await apiFetch("/cities", { method: "POST", body: JSON.stringify({ name: trimmed }) });
        const city = await r.json();
        resolvedSCity = city.name ?? trimmed;
      } catch { resolvedSCity = trimmed; }
    }

    /* ── Save custom district to catalog ── */
    if (assetType === "chalet" && cDistrictSelectVal === "__other__" && cCustomDistrict.trim() && resolvedCLocation) {
      const cityObj = cities.find(c => c.name === resolvedCLocation);
      const cityId = cityObj?.id ?? cSelectedCityId;
      if (cityId) {
        try {
          await apiFetch("/districts", { method: "POST", body: JSON.stringify({ name: cCustomDistrict.trim(), cityId }) });
        } catch {}
      }
    }

    if (assetType === "chalet") {
      if (!cForm.nameAr.trim() || !resolvedCLocation || !cForm.district.trim()) { setError("الاسم والمدينة والحي مطلوبة"); return; }
      if (!propertyType) { setError("يجب اختيار نوع العقار"); return; }
      if (!sections) { setError("يجب اختيار عدد الأقسام"); return; }
      if (!cForm.price) { setError("يجب إدخال السعر الأساسي"); return; }
      if (chaletPhotos.length === 0) { setError("يجب إضافة صورة واحدة على الأقل"); return; }
      if (!legalAccepted) { setError("يجب الموافقة على الإقرار القانوني"); return; }
    } else {
      if (!sForm.businessName.trim() || !resolvedSCity || !resolvedServiceCategory) { setError("اسم النشاط والمدينة والفئة مطلوبة"); return; }
      if (!sForm.whatsapp.trim()) { setError("رقم الواتساب مطلوب"); return; }
      if (svcGallery.length < 3) { setError("يجب إضافة ٣ صور على الأقل للمعرض"); return; }
      if (!svcLegal) { setError("يجب الموافقة على الإقرار القانوني"); return; }
    }
    setSubmitting(true);
    try {
      let r: Response;
      if (assetType === "chalet") {
        const grid: Record<string, Record<string, number>> = {};
        (["morning","evening","fullday"] as const).forEach(p => {
          const entries: Record<string, number> = {};
          [0,1,2,3,4,5,6].forEach(d => { const v = dailyPriceGrid[d][p]; if (v.trim() && !isNaN(Number(v))) entries[String(d)] = Number(v); });
          if (Object.keys(entries).length) grid[p] = entries;
        });
        r = await apiFetch("/admin/direct-add-chalet", { method:"POST", body: JSON.stringify({
          ownerId, nameAr: cForm.nameAr.trim(), location: resolvedCLocation, district: cForm.district.trim(),
          whatsappNumber: cForm.whatsapp.trim(), pricePerNight: Number(cForm.price),
          priceMorning: cForm.priceMorning ? Number(cForm.priceMorning) : null,
          priceEvening: cForm.priceEvening ? Number(cForm.priceEvening) : null,
          priceFullDay: cForm.priceFullDay ? Number(cForm.priceFullDay) : null,
          descriptionAr: cForm.descriptionAr || null, propertyType, sections,
          bedrooms: hasBedrooms && bedroomCount ? Number(bedroomCount) : null,
          maxGuests: maxGuests ? Number(maxGuests) : null,
          mapsUrl: cForm.mapsUrl || null, socialLink: cForm.socialLink || null,
          termsAndConditions: cForm.termsAndConditions || null, seasonalDisclaimer,
          amenities: [...Array.from(selectedAmenities), ...customAmenityTags.map(t => `other:${t}`)],
          photos: chaletPhotos, videoUrl: chaletVideo || null,
          dailyPrices: Object.keys(grid).length ? grid : null,
          slotMorning, slotEvening, slotFullDay,
          morningCheckIn: morningCheckIn || null, morningCheckOut: morningCheckOut || null,
          eveningCheckIn: eveningCheckIn || null, eveningCheckOut: eveningCheckOut || null,
          fullDayCheckIn: fullDayCheckIn || null, fullDayCheckOut: fullDayCheckOut || null,
        })});
      } else {
        r = await apiFetch("/admin/direct-add-service", { method:"POST", body: JSON.stringify({
          ownerId, businessName: sForm.businessName.trim(), category: resolvedServiceCategory, city: resolvedSCity,
          whatsappNumber: sForm.whatsapp.trim(), descriptionAr: sForm.descriptionAr || null,
          yearsOfExperience: sForm.yearsOfExperience ? Number(sForm.yearsOfExperience) : null,
          coverageTags, customFeatureTags, logoUrl: svcLogoUrl || DA_SERVICE_DEFAULT_LOGO, galleryPhotos: svcGallery, videoUrl: svcVideo,
        })});
      }
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { setError(json.error ?? "حدث خطأ غير متوقع"); }
      else {
        setSuccess(assetType === "chalet" ? `تم إضافة "${cForm.nameAr}" بنجاح ✓` : `تم إضافة "${sForm.businessName}" بنجاح ✓`);
        resetAll();
        qc.invalidateQueries({ queryKey: ["admin","owners"] });
        qc.invalidateQueries({ queryKey: ["admin","cities"] });
      }
    } catch { setError("فشل الاتصال بالخادم"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <div>
        <h2 className="text-xl font-bold text-white">
          {mode === "owner" ? "إضافة مالك جديد" : mode === "service" ? "إضافة مزود خدمة / فعالية جديد" : "إضافة عقار جديد"}
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          {mode === "owner"
            ? "أنشئ حساب مالك جديداً ليتمكن من تسجيل الدخول وإدارة عقاراته."
            : "أنشئ عقاراً أو مزود خدمة/فعالية تحت حساب مالك موجود — يُفعّل فوراً دون مراجعة."}
        </p>
      </div>

      {/* Type toggle */}
      {!ownerOnly && <div className="flex rounded-lg overflow-hidden border border-slate-700">
        <button type="button" onClick={() => { setAssetType("chalet"); resetAll(); }} className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${assetType==="chalet" ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>🏡 عقار</button>
        <button type="button" onClick={() => { setAssetType("service"); resetAll(); }} className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${assetType==="service" ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>🎪 مزود خدمة / فعالية</button>
      </div>}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── OWNER SECTION ── */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">{ownerOnly ? "بيانات المالك الجديد" : "المالك"}</h3>
          {!ownerOnly && <div className="space-y-1.5">
            <label className="text-sm text-slate-300 font-medium">اختر مالكاً موجوداً</label>
            {owners.length === 0
              ? <p className="text-slate-500 text-sm py-2">لا يوجد ملاك مسجّلون بعد</p>
              : <OwnerPickerInput owners={owners} value={ownerId} onChange={setOwnerId} />
            }
            {ownerId && (
              <p className="text-emerald-400 text-xs mt-1">
                ✓ تم اختيار: {owners.find(o => o.ownerId === ownerId)?.ownerName ?? ownerId}
              </p>
            )}
          </div>}
          {ownerRegOk && <div className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-sm">{ownerRegOk}</div>}
          {!ownerOnly && <button type="button" onClick={() => setShowNewOwner(v => !v)} className="text-amber-400 text-sm hover:underline underline-offset-2">
            {showNewOwner ? "← إخفاء نموذج التسجيل" : "+ تسجيل مالك جديد"}
          </button>}
          {showNewOwner && (
            <div className="border border-slate-600 rounded-lg p-4 space-y-3 bg-slate-900/60">
              <p className="text-xs text-slate-400">سيُسجَّل المالك برقم جواله، ويمكن إضافة البريد الإلكتروني اختياريًا.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2"><label className="text-xs text-slate-400">الاسم الكامل *</label><Input value={newOwner.fullName} onChange={e => setNewOwner(v => ({...v, fullName: e.target.value}))} placeholder="محمد عبدالله السليم" className="bg-slate-800 border-slate-600 text-white text-sm h-8" /></div>
                <div className="space-y-1"><label className="text-xs text-slate-400">رقم الجوال *</label><div className="flex h-8 rounded-md border border-slate-600 bg-slate-800 overflow-hidden" dir="ltr"><span className="inline-flex items-center px-2 border-r border-slate-600 text-slate-400 text-xs font-medium select-none">+966</span><Input value={toAr(newOwner.phone)} onChange={e => setNewOwner(v => { let digits = fromAr(e.target.value).replace(/\D/g, ""); if (digits.startsWith("966")) digits = digits.slice(3); return {...v, phone: digits.replace(/^0/, "")}; })} placeholder="٥XXXXXXXX" data-no-arabic inputMode="numeric" className="flex-1 h-full border-0 rounded-none bg-transparent text-white text-sm focus-visible:ring-0" /></div></div>
                <div className="space-y-1"><label className="text-xs text-slate-400">البريد الإلكتروني</label><Input value={newOwner.email} onChange={e => setNewOwner(v => ({...v, email: e.target.value}))} placeholder="example@email.com (اختياري)" type="email" data-no-arabic className="bg-slate-800 border-slate-600 text-white text-sm h-8" /></div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-slate-400">كلمة المرور * (٦ أحرف على الأقل)</label>
                  <div className="relative">
                    <Input value={newOwner.password} onChange={e => setNewOwner(v => ({...v, password: e.target.value}))} placeholder="••••••••" type={showNewOwnerPw ? "text" : "password"} dir="ltr" className="bg-slate-800 border-slate-600 text-white text-sm h-8 text-left pr-8" />
                    <button type="button" tabIndex={-1} onClick={() => setShowNewOwnerPw(v => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {showNewOwnerPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-slate-400">تأكيد كلمة المرور *</label>
                  <div className="relative">
                    <Input value={newOwner.confirmPassword} onChange={e => setNewOwner(v => ({...v, confirmPassword: e.target.value}))} placeholder="••••••••" type={showNewOwnerCPw ? "text" : "password"} dir="ltr" className="bg-slate-800 border-slate-600 text-white text-sm h-8 text-left pr-8" />
                    <button type="button" tabIndex={-1} onClick={() => setShowNewOwnerCPw(v => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {showNewOwnerCPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              {ownerRegErr && <p className="text-red-400 text-xs">{ownerRegErr}</p>}
              <Button type="button" onClick={handleRegisterOwner} disabled={registeringOwner || !newOwner.fullName.trim() || !newOwner.phone.trim() || !newOwner.password || !newOwner.confirmPassword} className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs h-8 px-4">
                {registeringOwner ? <Loader2 className="animate-spin w-3 h-3 ml-1" /> : <Plus className="w-3 h-3 ml-1" />}تسجيل المالك
              </Button>
            </div>
          )}
        </section>

        {/* ──── CHALET FIELDS ──── */}
        {!ownerOnly && assetType === "chalet" && <>
          {/* Basic Info */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">المعلومات الأساسية</h3>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300 font-medium">اسم العقار *</label>
              <Input value={cForm.nameAr} onChange={e => setCForm(f => ({...f, nameAr: e.target.value}))} placeholder="مثال: عقار الأندلس" className="bg-slate-900 border-slate-600 text-white" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">نوع العقار *</label>
                <Select value={propertyType} onValueChange={setPropertyType}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {daCategories.length > 0
                      ? daCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.nameAr} className="text-white focus:bg-slate-700">
                            {cat.emoji} {cat.nameAr}
                          </SelectItem>
                        ))
                      : DA_PROPERTY_TYPES.map(pt => (
                          <SelectItem key={pt.value} value={pt.value} className="text-white focus:bg-slate-700">{pt.label}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">الأقسام *</label>
                <Select value={sections} onValueChange={setSections}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {DA_SECTIONS_OPTS.map(s => <SelectItem key={s.value} value={s.value} className="text-white focus:bg-slate-700">{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">المدينة *</label>
                <Select value={cCitySelectVal} onValueChange={v => {
                  setCCitySelectVal(v);
                  setCDistrictSelectVal(""); setCCustomDistrict(""); setCForm(f => ({...f, district: ""}));
                  if (v === "__other__") {
                    setCForm(f => ({...f, location: ""})); setCCustomCity(""); setCSelectedCityId(null);
                  } else {
                    setCForm(f => ({...f, location: v}));
                    const cityObj = cities.find(c => c.name === v);
                    setCSelectedCityId(cityObj?.id ?? null);
                  }
                }}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="اختر المدينة..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {cities.map(c => <SelectItem key={c.id} value={c.name} className="text-white focus:bg-slate-700">{c.name}</SelectItem>)}
                    <SelectItem value="__other__" className="text-amber-400 focus:bg-slate-700">مدينة أخرى...</SelectItem>
                  </SelectContent>
                </Select>
                {cCitySelectVal === "__other__" && (
                  <Input value={cCustomCity} onChange={e => setCCustomCity(e.target.value)} placeholder="اكتب اسم المدينة" className="bg-slate-900 border-slate-600 text-white mt-1" autoFocus />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">الحي *</label>
                <Select value={cDistrictSelectVal} onValueChange={v => {
                  setCDistrictSelectVal(v);
                  if (v === "__other__") { setCCustomDistrict(""); setCForm(f => ({...f, district: ""})); }
                  else { setCForm(f => ({...f, district: v})); }
                }}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder={daDistricts.length > 0 ? "اختر الحي..." : "حي / منطقة"} /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {daDistricts.map(d => <SelectItem key={d.id} value={d.name} className="text-white focus:bg-slate-700">{d.name}</SelectItem>)}
                    <SelectItem value="__other__" className="text-amber-400 focus:bg-slate-700">أخرى...</SelectItem>
                  </SelectContent>
                </Select>
                {cDistrictSelectVal === "__other__" && (
                  <Input value={cCustomDistrict} onChange={e => { setCCustomDistrict(e.target.value); setCForm(f => ({...f, district: e.target.value})); }} placeholder="اكتب اسم الحي أو المنطقة" className="bg-slate-900 border-slate-600 text-white mt-1" autoFocus />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">غرف النوم</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setHasBedrooms(v => !v)} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex-shrink-0 ${hasBedrooms ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-300"}`}>{hasBedrooms ? "يوجد" : "بدون"}</button>
                  {hasBedrooms && <Input value={toAr(bedroomCount)} onChange={e => setBedroomCount(fromAr(e.target.value))} placeholder="العدد" inputMode="numeric" className="bg-slate-900 border-slate-600 text-white text-center" />}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">أقصى عدد ضيوف</label>
                <Input value={toAr(maxGuests)} onChange={e => setMaxGuests(fromAr(e.target.value))} placeholder="٠" inputMode="numeric" className="bg-slate-900 border-slate-600 text-white" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300 font-medium">رقم الواتساب *</label>
              <Input value={toAr(cForm.whatsapp)} onChange={e => setCForm(f => ({...f, whatsapp: fromAr(e.target.value)}))} placeholder="٠٥XXXXXXXX" inputMode="numeric" data-no-arabic className="bg-slate-900 border-slate-600 text-white" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">رابط الخريطة</label>
                <Input value={cForm.mapsUrl} onChange={e => setCForm(f => ({...f, mapsUrl: e.target.value}))} placeholder="https://maps.google.com/..." className="bg-slate-900 border-slate-600 text-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">رابط السوشيال</label>
                <Input value={cForm.socialLink} onChange={e => setCForm(f => ({...f, socialLink: e.target.value}))} placeholder="https://instagram.com/..." className="bg-slate-900 border-slate-600 text-white" />
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">التسعير</h3>
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">الفترات المتاحة</label>
              <div className="flex gap-2">
                {[{k:"morning",l:"صباحية",s:slotMorning,fn:setSlotMorning},{k:"evening",l:"مسائية",s:slotEvening,fn:setSlotEvening},{k:"fullday",l:"يومية كاملة",s:slotFullDay,fn:setSlotFullDay}].map(sl => (
                  <button key={sl.k} type="button" onClick={() => sl.fn(v => !v)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${sl.s ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-400"}`}>{sl.l}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">السعر الأساسي (ليلة) *</label>
                <Input value={toAr(cForm.price)} onChange={e => setCForm(f => ({...f, price: fromAr(e.target.value)}))} placeholder="٠" inputMode="numeric" className="bg-slate-900 border-slate-600 text-white text-center" required />
              </div>
              {slotMorning && <div className="space-y-1.5"><label className="text-xs text-slate-400 font-medium">سعر الصباحية</label><Input value={toAr(cForm.priceMorning)} onChange={e => setCForm(f => ({...f, priceMorning: fromAr(e.target.value)}))} placeholder="٠" inputMode="numeric" className="bg-slate-900 border-slate-600 text-white text-center" /></div>}
              {slotEvening && <div className="space-y-1.5"><label className="text-xs text-slate-400 font-medium">سعر المسائية</label><Input value={toAr(cForm.priceEvening)} onChange={e => setCForm(f => ({...f, priceEvening: fromAr(e.target.value)}))} placeholder="٠" inputMode="numeric" className="bg-slate-900 border-slate-600 text-white text-center" /></div>}
              {slotFullDay && <div className="space-y-1.5"><label className="text-xs text-slate-400 font-medium">سعر اليوم الكامل</label><Input value={toAr(cForm.priceFullDay)} onChange={e => setCForm(f => ({...f, priceFullDay: fromAr(e.target.value)}))} placeholder="٠" inputMode="numeric" className="bg-slate-900 border-slate-600 text-white text-center" /></div>}
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-amber-400 hover:text-amber-300 select-none">📅 جدول أسعار الأيام (اختياري)</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead><tr>
                    <th className="text-slate-400 text-right pr-2 py-1.5 font-medium">اليوم</th>
                    {slotMorning && <th className="text-slate-400 text-center py-1.5">صباحية</th>}
                    {slotEvening && <th className="text-slate-400 text-center py-1.5">مسائية</th>}
                    {slotFullDay && <th className="text-slate-400 text-center py-1.5">يومية</th>}
                  </tr></thead>
                  <tbody>
                    {[0,1,2,3,4,5,6].map(d => (
                      <tr key={d} className="border-t border-slate-700/50">
                        <td className="text-slate-300 pr-2 py-1 font-medium">{DA_DAY_NAMES[d]}</td>
                        {slotMorning && <td className="py-1 px-1"><Input value={toAr(dailyPriceGrid[d].morning)} onChange={e => setDailyPriceGrid(g => ({...g,[d]:{...g[d],morning:fromAr(e.target.value)}}))} placeholder="—" inputMode="numeric" className="bg-slate-900 border-slate-700 text-white text-center h-7 text-xs w-20 mx-auto" /></td>}
                        {slotEvening && <td className="py-1 px-1"><Input value={toAr(dailyPriceGrid[d].evening)} onChange={e => setDailyPriceGrid(g => ({...g,[d]:{...g[d],evening:fromAr(e.target.value)}}))} placeholder="—" inputMode="numeric" className="bg-slate-900 border-slate-700 text-white text-center h-7 text-xs w-20 mx-auto" /></td>}
                        {slotFullDay && <td className="py-1 px-1"><Input value={toAr(dailyPriceGrid[d].fullday)} onChange={e => setDailyPriceGrid(g => ({...g,[d]:{...g[d],fullday:fromAr(e.target.value)}}))} placeholder="—" inputMode="numeric" className="bg-slate-900 border-slate-700 text-white text-center h-7 text-xs w-20 mx-auto" /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-sm text-amber-400 hover:text-amber-300 select-none">⏰ أوقات الدخول والخروج لكل فترة</summary>
              <div className="mt-3 space-y-3">
                {slotMorning && <div>
                  <p className="text-xs text-slate-400 mb-2 font-medium">📅 الفترة الصباحية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الدخول</label><Input type="time" value={morningCheckIn} onChange={e => setMorningCheckIn(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الخروج</label><Input type="time" value={morningCheckOut} onChange={e => setMorningCheckOut(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                  </div>
                </div>}
                {slotEvening && <div>
                  <p className="text-xs text-slate-400 mb-2 font-medium">🌙 الفترة المسائية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الدخول</label><Input type="time" value={eveningCheckIn} onChange={e => setEveningCheckIn(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الخروج</label><Input type="time" value={eveningCheckOut} onChange={e => setEveningCheckOut(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                  </div>
                </div>}
                {slotFullDay && <div>
                  <p className="text-xs text-slate-400 mb-2 font-medium">☀️ اليوم الكامل</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الدخول</label><Input type="time" value={fullDayCheckIn} onChange={e => setFullDayCheckIn(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الخروج</label><Input type="time" value={fullDayCheckOut} onChange={e => setFullDayCheckOut(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                  </div>
                </div>}
              </div>
            </details>
          </section>

          {/* Description + Terms */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">الوصف والشروط</h3>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300 font-medium">وصف العقار</label>
              <Textarea value={cForm.descriptionAr} onChange={e => setCForm(f => ({...f, descriptionAr: e.target.value}))} placeholder="وصف العقار والمزايا..." rows={3} className="bg-slate-900 border-slate-600 text-white resize-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300 font-medium">الشروط والأحكام</label>
              <Textarea value={cForm.termsAndConditions} onChange={e => setCForm(f => ({...f, termsAndConditions: e.target.value}))} rows={5} className="bg-slate-900 border-slate-600 text-white resize-none text-sm font-mono" />
            </div>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSeasonalDisclaimer(v => !v)}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${seasonalDisclaimer ? "bg-amber-500 border-amber-500" : "border-slate-600"}`}>{seasonalDisclaimer && <Check className="w-3 h-3 text-slate-900" />}</div>
              <label className="text-sm text-slate-300 cursor-pointer">تفعيل إخلاء المسؤولية الموسمية</label>
            </div>
          </section>

          {/* Amenities */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">المرافق والمميزات</h3>
            {amenities.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {amenities.map(a => {
                  const checked = selectedAmenities.has(a.key);
                  return (
                    <button key={a.key} type="button" onClick={() => setSelectedAmenities(s => { const n = new Set(s); checked ? n.delete(a.key) : n.add(a.key); return n; })} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-right ${checked ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-600 bg-slate-900/50 text-slate-400 hover:border-slate-500"}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? "bg-amber-500 border-amber-500" : "border-slate-500"}`}>{checked && <Check className="w-2.5 h-2.5 text-slate-900" />}</div>
                      {a.labelAr}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={customAmenityInput} onChange={e => setCustomAmenityInput(e.target.value)} onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); if (customAmenityInput.trim()) { setCustomAmenityTags(t => [...t, customAmenityInput.trim()]); setCustomAmenityInput(""); }}}} placeholder="أضف ميزة مخصصة..." className="bg-slate-900 border-slate-600 text-white flex-1" />
              <Button type="button" onClick={() => { if (customAmenityInput.trim()) { setCustomAmenityTags(t => [...t, customAmenityInput.trim()]); setCustomAmenityInput(""); }}} className="bg-slate-700 hover:bg-slate-600 text-white px-3">إضافة</Button>
            </div>
            {customAmenityTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customAmenityTags.map((t, i) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-300 text-xs">
                    {t}<button type="button" onClick={() => setCustomAmenityTags(arr => arr.filter((_,j) => j!==i))} className="hover:text-red-400 ml-1">×</button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Photos & Video */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">الصور والفيديو</h3>
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">صور العقار * (حتى ١٥ صورة)</label>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                const files = Array.from(e.target.files ?? []); if (!files.length) return;
                setUploadingCPh(true);
                const urls: string[] = [];
                for (const f of files.slice(0, 15 - chaletPhotos.length)) { const u = await daUploadFile(f, "image"); if (u) urls.push(u); }
                setChaletPhotos(p => [...p, ...urls]); setUploadingCPh(false); e.target.value = "";
              }} />
              <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingCPh || chaletPhotos.length >= 15} className="w-full border-2 border-dashed border-slate-600 rounded-lg py-8 text-center text-slate-400 hover:border-amber-500/50 hover:text-amber-400 transition-colors disabled:opacity-50">
                {uploadingCPh ? <><Loader2 className="animate-spin w-5 h-5 mx-auto mb-1" /><div className="text-xs">جاري الرفع...</div></> : <><ImageIcon className="w-6 h-6 mx-auto mb-2" /><div className="text-sm">اضغط لاختيار الصور ({chaletPhotos.length}/١٥)</div></>}
              </button>
              {chaletPhotos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {chaletPhotos.map((url, i) => (
                    <div key={i} className="relative group aspect-video rounded overflow-hidden bg-slate-900">
                      <img src={url} className="w-full h-full object-cover" alt="" />
                      <button type="button" onClick={() => setChaletPhotos(p => p.filter((_,j) => j!==i))} className="absolute top-1 left-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                      {i === 0 && <span className="absolute bottom-1 right-1 text-xs bg-amber-500 text-slate-900 px-1 rounded font-bold">رئيسية</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">فيديو العقار (اختياري)</label>
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setUploadingCVid(true); const url = await daUploadFile(file, "video"); if (url) setChaletVideo(url);
                setUploadingCVid(false); e.target.value = "";
              }} />
              {chaletVideo ? (
                <div className="flex items-center gap-3 bg-slate-900 rounded-lg p-3">
                  <Video className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <span className="text-sm text-slate-300 truncate flex-1">تم رفع الفيديو ✓</span>
                  <button type="button" onClick={() => setChaletVideo(null)} className="text-red-400 text-xs hover:underline">إزالة</button>
                </div>
              ) : (
                <button type="button" onClick={() => videoInputRef.current?.click()} disabled={uploadingCVid} className="w-full border-2 border-dashed border-slate-600 rounded-lg py-5 text-center text-slate-400 hover:border-amber-500/50 hover:text-amber-400 transition-colors disabled:opacity-50">
                  {uploadingCVid ? <><Loader2 className="animate-spin w-4 h-4 mx-auto mb-1" /><div className="text-xs">جاري رفع الفيديو...</div></> : <><Video className="w-5 h-5 mx-auto mb-1" /><div className="text-sm">اضغط لرفع فيديو</div></>}
                </button>
              )}
            </div>
          </section>

          {/* Legal */}
          <section className="bg-slate-800/50 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-start gap-3 cursor-pointer" onClick={() => setLegalAccepted(v => !v)}>
              <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${legalAccepted ? "bg-amber-500 border-amber-500" : "border-slate-600"}`}>{legalAccepted && <Check className="w-3 h-3 text-slate-900" />}</div>
              <p className="text-sm text-slate-300">أقرّ بأن جميع المعلومات المدخلة صحيحة وأن صاحب العقار وافق على شروط المنصة وأذن بنشر هذا العقار.</p>
            </div>
          </section>
        </>}

        {/* ──── SERVICE FIELDS ──── */}
        {!ownerOnly && assetType === "service" && <>
          {/* Basic Info */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">المعلومات الأساسية</h3>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300 font-medium">اسم النشاط التجاري *</label>
              <Input value={sForm.businessName} onChange={e => setSForm(f => ({...f, businessName: e.target.value}))} placeholder="مثال: شركة الأفراح للمناسبات" className="bg-slate-900 border-slate-600 text-white" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">المدينة *</label>
                <Select value={sCitySelectVal} onValueChange={v => {
                  setSCitySelectVal(v);
                  if (v === "__other__") { setSForm(f => ({...f, city: ""})); setSCustomCity(""); }
                  else { setSForm(f => ({...f, city: v})); }
                }}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="اختر المدينة..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {cities.map(c => <SelectItem key={c.id} value={c.name} className="text-white focus:bg-slate-700">{c.name}</SelectItem>)}
                    <SelectItem value="__other__" className="text-amber-400 focus:bg-slate-700">مدينة أخرى...</SelectItem>
                  </SelectContent>
                </Select>
                {sCitySelectVal === "__other__" && (
                  <Input value={sCustomCity} onChange={e => setSCustomCity(e.target.value)} placeholder="اكتب اسم المدينة" className="bg-slate-900 border-slate-600 text-white mt-1" autoFocus />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">فئة الخدمة *</label>
                <Select value={sForm.category} onValueChange={v => {
                  setSForm(f => ({...f, category: v}));
                  if (v !== "__other__") setCustomServiceCategory("");
                }}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="اختر الفئة..." /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {serviceCategories.map(cat => <SelectItem key={cat.key} value={cat.key} className="text-white focus:bg-slate-700">{cat.emoji} {cat.labelAr}</SelectItem>)}
                    <SelectItem value="__other__" className="text-amber-400 focus:bg-slate-700">فئة أخرى...</SelectItem>
                  </SelectContent>
                </Select>
                {sForm.category === "__other__" && (
                  <div className="space-y-1 mt-2">
                    <label className="text-xs text-slate-400">اكتب اسم فئة الخدمة*</label>
                    <Input value={customServiceCategory} onChange={e => setCustomServiceCategory(e.target.value)} placeholder="مثال: تصوير مناسبات" className="bg-slate-900 border-slate-600 text-white" autoFocus />
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">رقم الواتساب *</label>
                <Input value={toAr(sForm.whatsapp)} onChange={e => setSForm(f => ({...f, whatsapp: fromAr(e.target.value)}))} placeholder="٠٥XXXXXXXX" inputMode="numeric" data-no-arabic className="bg-slate-900 border-slate-600 text-white" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-slate-300 font-medium">سنوات الخبرة</label>
                <Input value={toAr(sForm.yearsOfExperience)} onChange={e => setSForm(f => ({...f, yearsOfExperience: fromAr(e.target.value)}))} placeholder="٠" inputMode="numeric" data-no-arabic className="bg-slate-900 border-slate-600 text-white" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300 font-medium">وصف النشاط</label>
              <Textarea value={sForm.descriptionAr} onChange={e => setSForm(f => ({...f, descriptionAr: e.target.value}))} placeholder="وصف الخدمات التي يقدمها النشاط..." rows={3} className="bg-slate-900 border-slate-600 text-white resize-none" />
            </div>
          </section>

          {/* Coverage + Custom Tags */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">نطاق التغطية والمميزات</h3>
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">مدن التغطية</label>
              <div className="grid grid-cols-3 gap-2">
                {cities.map(c => {
                  const active = coverageTags.includes(c.name);
                  return (
                    <button key={c.id} type="button" onClick={() => setCoverageTags(t => active ? t.filter(x => x!==c.name) : [...t, c.name])} className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${active ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-600 bg-slate-900/50 text-slate-400 hover:border-slate-500"}`}>
                      {c.name}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setShowCoverageCityInput(v => !v)} className="px-3 py-1.5 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 text-amber-300 text-sm transition-colors hover:bg-amber-500/10">
                  + إضافة مدينة أخرى
                </button>
              </div>
              {showCoverageCityInput && (
                <div className="flex gap-2 pt-1">
                  <Input value={coverageCityInput} onChange={e => setCoverageCityInput(e.target.value)} onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const cityName = coverageCityInput.trim();
                      if (!cityName) return;
                      setCoverageTags(tags => tags.some(tag => tag.toLowerCase() === cityName.toLowerCase()) ? tags : [...tags, cityName]);
                      setCoverageCityInput(""); setShowCoverageCityInput(false);
                    }
                  }} placeholder="اكتب اسم المدينة" className="bg-slate-900 border-slate-600 text-white flex-1" autoFocus />
                  <Button type="button" onClick={() => {
                    const cityName = coverageCityInput.trim();
                    if (!cityName) return;
                    setCoverageTags(tags => tags.some(tag => tag.toLowerCase() === cityName.toLowerCase()) ? tags : [...tags, cityName]);
                    setCoverageCityInput(""); setShowCoverageCityInput(false);
                  }} className="bg-slate-700 hover:bg-slate-600 text-white px-3">إضافة</Button>
                </div>
              )}
              {coverageTags.some(tag => !cities.some(city => city.name === tag)) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {coverageTags.filter(tag => !cities.some(city => city.name === tag)).map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-300 text-xs">
                      {tag}<button type="button" onClick={() => setCoverageTags(tags => tags.filter(city => city !== tag))} className="hover:text-red-400">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">مميزات مخصصة</label>
              <div className="flex gap-2">
                <Input value={customFeatureInput} onChange={e => setCustomFeatureInput(e.target.value)} onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); if (customFeatureInput.trim()) { setCustomFeatureTags(t => [...t, customFeatureInput.trim()]); setCustomFeatureInput(""); }}}} placeholder="مثال: توصيل مجاني، عروض خاصة..." className="bg-slate-900 border-slate-600 text-white flex-1" />
                <Button type="button" onClick={() => { if (customFeatureInput.trim()) { setCustomFeatureTags(t => [...t, customFeatureInput.trim()]); setCustomFeatureInput(""); }}} className="bg-slate-700 hover:bg-slate-600 text-white px-3">إضافة</Button>
              </div>
              {customFeatureTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customFeatureTags.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-300 text-xs">
                      {t}<button type="button" onClick={() => setCustomFeatureTags(arr => arr.filter((_,j) => j!==i))} className="hover:text-red-400 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Logo + Gallery + Video */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">الشعار والمعرض والفيديو</h3>
            {/* Logo */}
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">شعار النشاط (اختياري)</label>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setUploadingLogo(true); const url = await daUploadFile(file, "image"); if (url) setSvcLogoUrl(url);
                setUploadingLogo(false); e.target.value = "";
              }} />
              {svcLogoUrl ? (
                <div className="flex items-center gap-3">
                  <img src={svcLogoUrl} className="w-16 h-16 object-cover rounded-lg border border-slate-600" alt="شعار النشاط" />
                  <button type="button" onClick={() => setSvcLogoUrl(null)} className="text-red-400 text-xs hover:underline">إزالة</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 border-2 border-dashed border-slate-600 rounded-lg p-3">
                  <img src={DA_SERVICE_DEFAULT_LOGO} className="w-16 h-16 object-cover rounded-lg border border-slate-600" alt="الشعار الافتراضي للنشاط" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-300">سيُستخدم الشعار الافتراضي عند عدم الرفع</p>
                    <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="mt-1 text-sm text-amber-400 hover:text-amber-300 disabled:opacity-50">
                      {uploadingLogo ? <span className="inline-flex items-center gap-1"><Loader2 className="animate-spin w-3.5 h-3.5" />جاري الرفع...</span> : "رفع شعار مخصص"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Gallery */}
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">صور المعرض * (٣ على الأقل، حتى ١٠)</label>
              <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                const files = Array.from(e.target.files ?? []); if (!files.length) return;
                setUploadingGal(true);
                const urls: string[] = [];
                for (const f of files.slice(0, 10 - svcGallery.length)) { const u = await daUploadFile(f, "image"); if (u) urls.push(u); }
                setSvcGallery(p => [...p, ...urls]); setUploadingGal(false); e.target.value = "";
              }} />
              <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={uploadingGal || svcGallery.length >= 10} className="w-full border-2 border-dashed border-slate-600 rounded-lg py-6 text-center text-slate-400 hover:border-amber-500/50 hover:text-amber-400 transition-colors disabled:opacity-50">
                {uploadingGal ? <><Loader2 className="animate-spin w-4 h-4 mx-auto mb-1" /><div className="text-xs">جاري الرفع...</div></> : <><ImageIcon className="w-5 h-5 mx-auto mb-1" /><div className="text-sm">اختر صور المعرض ({svcGallery.length}/١٠)</div></>}
              </button>
              {svcGallery.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {svcGallery.map((url, i) => (
                    <div key={i} className="relative group aspect-video rounded overflow-hidden bg-slate-900">
                      <img src={url} className="w-full h-full object-cover" alt="" />
                      <button type="button" onClick={() => setSvcGallery(p => p.filter((_,j) => j!==i))} className="absolute top-1 left-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Video */}
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">فيديو تعريفي (اختياري)</label>
              <input ref={svcVideoInputRef} type="file" accept="video/*" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setUploadingSVid(true); const url = await daUploadFile(file, "video"); if (url) setSvcVideo(url);
                setUploadingSVid(false); e.target.value = "";
              }} />
              {svcVideo ? (
                <div className="flex items-center gap-3 bg-slate-900 rounded-lg p-3">
                  <Video className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <span className="text-sm text-slate-300 truncate flex-1">تم رفع الفيديو ✓</span>
                  <button type="button" onClick={() => setSvcVideo(null)} className="text-red-400 text-xs hover:underline">إزالة</button>
                </div>
              ) : (
                <button type="button" onClick={() => svcVideoInputRef.current?.click()} disabled={uploadingSVid} className="w-full border-2 border-dashed border-slate-600 rounded-lg py-5 text-center text-slate-400 hover:border-amber-500/50 hover:text-amber-400 transition-colors disabled:opacity-50">
                  {uploadingSVid ? <><Loader2 className="animate-spin w-4 h-4 mx-auto mb-1" /><div className="text-xs">جاري رفع الفيديو...</div></> : <><Video className="w-5 h-5 mx-auto mb-1" /><div className="text-sm">اضغط لرفع فيديو</div></>}
                </button>
              )}
            </div>
          </section>

          {/* Legal */}
          <section className="bg-slate-800/50 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSvcLegal(v => !v)}>
              <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${svcLegal ? "bg-amber-500 border-amber-500" : "border-slate-600"}`}>{svcLegal && <Check className="w-3 h-3 text-slate-900" />}</div>
              <p className="text-sm text-slate-300">أقرّ بأن جميع المعلومات المدخلة صحيحة وأن صاحب النشاط يوافق على شروط المنصة ويأذن بنشر هذه البطاقة.</p>
            </div>
          </section>
        </>}

        {/* Error / Success */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm">
            <XCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />{success}
          </div>
        )}

        {!ownerOnly && <Button
          type="submit"
          disabled={submitting || !ownerId
            || (assetType==="chalet" && (!cForm.nameAr||!cForm.location||!cForm.district||!propertyType||!sections||!cForm.price||!legalAccepted))
            || (assetType==="service" && (!sForm.businessName||!(sCitySelectVal === "__other__" ? sCustomCity.trim() : sForm.city)||!(sForm.category === "__other__" ? customServiceCategory.trim() : sForm.category)||!sForm.whatsapp||svcGallery.length < 3||!svcLegal))}
          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-3 text-base"
        >
          {submitting ? <Loader2 className="animate-spin w-5 h-5 ml-2" /> : <Plus className="w-5 h-5 ml-2" />}
          {assetType==="chalet" ? "إضافة العقار الآن" : "+ إضافة مزود الخدمة / الفعالية الآن"}
        </Button>}
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Terms Management Tab — dedicated CRUD for platform Terms of Use
   ══════════════════════════════════════════════════════════════ */
function TermsManagementTab() {
  const qc = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  function apiFetch(path: string, opts?: RequestInit) {
    return fetch(`${BASE}/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
      ...opts,
    });
  }

  const [termsText, setTermsText] = useState("");
  const [saved, setSaved] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const r = await apiFetch("/admin/settings");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  useEffect(() => {
    if (settings?.terms_page_content !== undefined) {
      setTermsText(settings.terms_page_content ?? "");
      setCharCount((settings.terms_page_content ?? "").length);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await apiFetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ terms_page_content: text }),
      });
      if (!r.ok) throw new Error("فشل الحفظ");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["page-content"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-slate-400 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header card */}
      <div className="bg-gradient-to-l from-amber-500/20 to-slate-800 border border-amber-500/30 rounded-2xl p-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
          <FileCheck className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-100 mb-1">إدارة شروط الاستخدام</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            النص الذي تكتبه هنا يظهر مباشرةً على{" "}
            <span className="text-amber-300 font-medium">صفحة تسجيل الملاك الجدد</span> في خانة
            «شروط استخدام المنصة»، ويُشترط الموافقة عليه لإتمام التسجيل.
            أي تعديل تحفظه هنا ينعكس فوراً على نموذج التسجيل.
          </p>
          <div className="flex flex-wrap gap-3 mt-3">
            <a
              href="/register"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              معاينة صفحة التسجيل ↗
            </a>
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              معاينة صفحة الشروط الكاملة ↗
            </a>
          </div>
        </div>
      </div>

      {/* Editor card */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400"></div>
            <span className="text-slate-200 font-semibold text-sm">نص شروط الاستخدام</span>
          </div>
          <span className="text-xs text-slate-500">{charCount} حرف</span>
        </div>

        <div className="p-6 space-y-4">
          <Textarea
            value={termsText}
            onChange={(e) => {
              setTermsText(e.target.value);
              setCharCount(e.target.value.length);
            }}
            placeholder={`مثال على شروط الاستخدام:\n\nيمنع التدخين داخل الشاليه\nوقت تسجيل الخروج الساعة ١٠:٠٠ صباحاً\nيمنع إحضار الحيوانات الأليفة\nالضيوف المسموح بهم فقط كما هو محدد عند الحجز\nأي أضرار تلحق بالمكان تُحسب على الضيف\n\nيُقرّ المالك بأن هذه الشروط ملزمة قانوناً...`}
            rows={18}
            dir="rtl"
            className="bg-slate-900 border-slate-600 text-slate-100 placeholder:text-slate-600 text-sm leading-relaxed resize-y font-medium"
          />

          <div className="flex items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate(termsText)}
              disabled={saveMutation.isPending}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-8 py-2.5 gap-2 text-sm flex-1 sm:flex-none"
            >
              {saveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</>
              ) : saved ? (
                <><Check className="w-4 h-4" /> تم الحفظ ✓</>
              ) : (
                <><Save className="w-4 h-4" /> حفظ الشروط</>
              )}
            </Button>
            {saved && (
              <span className="text-green-400 text-sm font-medium animate-fade-in">
                ✓ تم تحديث الشروط — يظهر الآن على صفحة التسجيل
              </span>
            )}
          </div>

          {saveMutation.isError && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-2">
              ⚠️ فشل الحفظ، يرجى المحاولة مرة أخرى
            </p>
          )}
        </div>
      </div>

      {/* Live preview */}
      {termsText && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="text-slate-300 font-semibold text-sm">معاينة — كما يراه المالك عند التسجيل</span>
          </div>
          <div className="p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-h-48 overflow-y-auto">
              <pre className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed font-sans" dir="rtl">
                {termsText}
              </pre>
            </div>
            <div className="mt-4 flex items-start gap-3 bg-green-950/30 border border-green-800/30 rounded-xl px-4 py-3">
              <div className="w-4 h-4 rounded border border-green-500 bg-green-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-green-400" />
              </div>
              <span className="text-green-300 text-sm">أوافق على شروط استخدام المنصة</span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-3">
        <h4 className="text-slate-300 font-semibold text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          تعليمات الاستخدام
        </h4>
        <ul className="text-slate-400 text-sm space-y-2 list-disc list-inside leading-relaxed">
          <li>اكتب كل بند في سطر مستقل لتظهر الشروط بشكل واضح ومرتب</li>
          <li>يمكنك استخدام الأرقام في بداية كل سطر (مثال: ١. يمنع التدخين)</li>
          <li>النص يُعرض كاملاً عند الضغط على «شروط استخدام المنصة» في نموذج التسجيل</li>
          <li>يجب على كل مالك جديد الموافقة على هذه الشروط قبل إتمام تسجيل حسابه</li>
          <li>التغييرات تنعكس فوراً — لا حاجة لإعادة تشغيل أي شيء</li>
        </ul>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Communication Settings Tab
   ══════════════════════════════════════════════════════════════ */
const DEFAULT_OTP_TEMPLATE = `مرحباً {NAME}،

شكراً لتسجيلك في منصة تكيّة. رمز التحقق الخاص بك لإتمام إنشاء حسابك هو:

{OTP}

هذا الرمز صالح لمدة ١٠ دقائق فقط.
إذا لم تطلب هذا الرمز، يرجى تجاهل هذا البريد.

منصة تكيّة`;

const DEFAULT_WELCOME_TEMPLATE = `مرحباً {NAME}،

يسعدنا انضمامك إلى منصة تكيّة! 🎉

حسابك الآن قيد المراجعة من فريق الإدارة. بعد التفعيل، يمكنك البدء بالخطوات التالية:

1️⃣  أضف شاليهك — أدخل الصور والتفاصيل والموقع
2️⃣  حدّد الأسعار والمواسم — يومي، نهاية أسبوع، مواسم خاصة
3️⃣  استقبل الحجوزات — وتابعها مباشرة من لوحة التحكم

سنُرسل إليك إشعاراً فور تفعيل حسابك.

فريق تكيّة ❤️`;

const DEFAULT_WA_OTP_TEMPLATE = `مرحباً {NAME}، رمز التحقق الخاص بك في منصة تكيّة هو: {OTP}
هذا الرمز صالح لمدة ١٠ دقائق فقط.`;

function CommunicationSettingsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const r = await apiFetch("/admin/settings");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const r = await apiFetch("/admin/settings", { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل الحفظ");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });

  function saveSection(keys: string[], label: string) {
    const partial: Record<string, string> = {};
    keys.forEach(k => { if (form[k] !== undefined) partial[k] = form[k]; });
    saveMutation.mutate(partial, {
      onSuccess: () => {
        setSaved(label);
        setTimeout(() => setSaved(null), 2500);
      },
    });
  }

  function Toggle({ settingKey, label, description }: { settingKey: string; label: string; description?: string }) {
    const on = form[settingKey] === "true";
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900/40 px-5 py-4">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          {description && <p className="text-xs text-slate-400">{description}</p>}
        </div>
        <button
          onClick={() => setForm(f => ({ ...f, [settingKey]: on ? "false" : "true" }))}
          className={`relative shrink-0 w-12 h-6 rounded-full transition-colors ${on ? "bg-green-500" : "bg-slate-600"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "right-0.5" : "left-0.5"}`} />
        </button>
      </div>
    );
  }

  function TemplateArea({ settingKey, placeholder, rows = 6 }: { settingKey: string; placeholder: string; rows?: number }) {
    return (
      <Textarea
        value={form[settingKey] ?? ""}
        onChange={e => setForm(f => ({ ...f, [settingKey]: e.target.value }))}
        placeholder={placeholder}
        rows={rows}
        dir="rtl"
        className="bg-slate-900 border-slate-600 text-white text-sm placeholder:text-slate-500 resize-y font-mono"
      />
    );
  }

  function SaveBtn({ keys, label }: { keys: string[]; label: string }) {
    const isSaving = saveMutation.isPending;
    const isSaved  = saved === label;
    return (
      <Button
        onClick={() => saveSection(keys, label)}
        disabled={isSaving}
        className="bg-amber-600 hover:bg-amber-700 w-full gap-2"
      >
        <Save className="w-4 h-4" />
        {isSaved ? "✓ تم الحفظ" : isSaving ? "جاري الحفظ..." : label}
      </Button>
    );
  }

  const placeholderBadge = (vars: string[]) => (
    <div className="flex flex-wrap gap-2 mb-2">
      {vars.map(v => (
        <span key={v} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-700 text-amber-300 border border-slate-600">
          {`{${v}}`}
        </span>
      ))}
      <span className="text-[10px] text-slate-500 self-center">متغيرات مدعومة</span>
    </div>
  );

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>;

  return (
    <div className="max-w-2xl space-y-6">

      {/* ══ 1. Email OTP ══ */}
      <div className="bg-slate-800 rounded-xl border border-green-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-green-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Mail className="w-5 h-5 text-green-400" />
          <h3 className="text-slate-100 font-bold text-lg">رمز التحقق عبر البريد (Email OTP)</h3>
        </div>
        <div className="p-6 space-y-5">
          <Toggle
            settingKey="email_otp_enabled"
            label="تفعيل رمز التحقق عبر البريد الإلكتروني"
            description="يُرسل رمز ٦ أرقام لكل مالك جديد عند التسجيل"
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">موضوع البريد (Subject)</label>
            <Input
              value={form.email_otp_subject ?? ""}
              onChange={e => setForm(f => ({ ...f, email_otp_subject: e.target.value }))}
              placeholder="رمز التحقق: {OTP} — منصة تكيّة"
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 text-sm"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص رسالة البريد</label>
            {placeholderBadge(["NAME", "OTP"])}
            <TemplateArea settingKey="email_otp_template" placeholder={DEFAULT_OTP_TEMPLATE} rows={8} />
            <p className="text-[11px] text-slate-500">اترك الحقل فارغاً لاستخدام القالب الافتراضي (HTML منسّق).</p>
          </div>

          <SaveBtn keys={["email_otp_enabled", "email_otp_subject", "email_otp_template"]} label="حفظ إعدادات OTP البريد" />
        </div>
      </div>

      {/* ══ 2. WhatsApp OTP ══ */}
      <div className="bg-slate-800 rounded-xl border border-emerald-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          <h3 className="text-slate-100 font-bold text-lg">رمز التحقق عبر واتساب (WhatsApp OTP)</h3>
          <span className="mr-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">قريباً</span>
        </div>
        <div className="p-6 space-y-5">
          <Toggle
            settingKey="wa_otp_enabled"
            label="تفعيل رمز التحقق عبر واتساب"
            description="إرسال رمز واتساب إضافي مع أو بدل البريد الإلكتروني (يتطلب تكامل WhatsApp API)"
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص رسالة واتساب</label>
            {placeholderBadge(["NAME", "OTP"])}
            <TemplateArea settingKey="wa_otp_template" placeholder={DEFAULT_WA_OTP_TEMPLATE} rows={4} />
          </div>

          <SaveBtn keys={["wa_otp_enabled", "wa_otp_template"]} label="حفظ إعدادات OTP واتساب" />
        </div>
      </div>

      {/* ══ 3. Welcome Email ══ */}
      <div className="bg-slate-800 rounded-xl border border-blue-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-blue-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Send className="w-5 h-5 text-blue-400" />
          <h3 className="text-slate-100 font-bold text-lg">بريد الترحيب بعد التحقق</h3>
        </div>
        <div className="p-6 space-y-5">
          <Toggle
            settingKey="welcome_email_enabled"
            label="إرسال بريد ترحيب تلقائياً"
            description="يُرسل تلقائياً بعد نجاح التحقق من البريد، ويتضمن خطوات البداية"
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">موضوع البريد (Subject)</label>
            <Input
              value={form.welcome_email_subject ?? ""}
              onChange={e => setForm(f => ({ ...f, welcome_email_subject: e.target.value }))}
              placeholder="مرحباً بك في منصة تكيّة 🎉"
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 text-sm"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص رسالة الترحيب</label>
            {placeholderBadge(["NAME"])}
            <TemplateArea settingKey="welcome_email_template" placeholder={DEFAULT_WELCOME_TEMPLATE} rows={10} />
            <p className="text-[11px] text-slate-500">اترك الحقل فارغاً لاستخدام القالب الافتراضي مع خطوات التأهيل.</p>
          </div>

          <SaveBtn keys={["welcome_email_enabled", "welcome_email_subject", "welcome_email_template"]} label="حفظ إعدادات بريد الترحيب" />
        </div>
      </div>

      {/* ══ 4. Dev Mode ══ */}
      <div className="bg-slate-800 rounded-xl border border-amber-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h3 className="text-slate-100 font-bold text-lg">وضع التطوير (Dev Mode)</h3>
          <span className="mr-auto text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">مؤقت</span>
        </div>
        <div className="p-6 space-y-4">
          <Toggle
            settingKey="otp_dev_mode"
            label="تفعيل وضع التطوير لرمز OTP"
            description="يقبل الرمز '123456' كرمز تحقق سحري بدون إرسال بريد — للاختبار فقط"
          />
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-300/80 space-y-1">
              <p className="font-semibold text-amber-300">عند تفعيل وضع التطوير:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>أي رمز التحقق المُدخل <span className="font-mono bg-amber-500/20 px-1 rounded">123456</span> سيُقبل لأي بريد إلكتروني</li>
                <li>الرمز الحقيقي المُرسل بالبريد يظل يعمل أيضاً</li>
                <li>أوقف هذا الخيار عند الإطلاق الفعلي للمنصة</li>
              </ul>
            </div>
          </div>
          <SaveBtn keys={["otp_dev_mode"]} label="حفظ إعداد وضع التطوير" />
        </div>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Contact Inquiries Tab — view and manage contact form submissions
   ══════════════════════════════════════════════════════════════ */
interface ContactInquiryRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  status: string;
  created_at: string;
}

/* ══════════════════════════════════════════════════════════════
   Owner Inbox Tab — messages from owner support center
   ══════════════════════════════════════════════════════════════ */
interface OwnerSupportRequest {
  id: number;
  owner_id: string;
  owner_name: string;
  subject: string;
  message: string;
  status: string;
  attachment_url?: string | null;
  attachment_urls?: string[];
  admin_reply: string | null;
  admin_reply_at: string | null;
  admin_attachment_url?: string | null;
  admin_attachment_urls?: string[];
  is_read_by_owner: boolean;
  created_at: string;
}

const SUPPORT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new:         { label: "جديد",          className: "bg-red-900/40 text-red-300 border border-red-700/40" },
  in_progress: { label: "قيد المعالجة", className: "bg-amber-900/40 text-amber-300 border border-amber-700/40" },
  resolved:    { label: "تم الحل",       className: "bg-green-900/40 text-green-300 border border-green-700/40" },
};

function OwnerInboxTab({ ownerIdFilter }: { ownerIdFilter?: string } = {}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const queryKey = ownerIdFilter
    ? ["admin", "support-requests", ownerIdFilter]
    : ["admin", "support-requests"];

  const { data: requests = [], isLoading } = useQuery<OwnerSupportRequest[]>({
    queryKey,
    queryFn: async () => {
      const url = ownerIdFilter
        ? `/admin/support-requests?ownerId=${encodeURIComponent(ownerIdFilter)}`
        : "/admin/support-requests";
      const r = await apiFetch(url);
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  async function updateStatus(id: number, status: string) {
    setUpdating(id);
    try {
      await apiFetch(`/admin/support-requests/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      qc.invalidateQueries({ queryKey: ["admin", "support-requests"] });
    } finally {
      setUpdating(null);
    }
  }

  async function sendReply(id: number) {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      const fd = new FormData();
      fd.append("reply", replyText.trim());
      for (const f of replyFiles) fd.append("files", f);
      const r = await fetch(`${BASE}/api/admin/support-requests/${id}/reply`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (r.ok) {
        setReplyingId(null);
        setReplyText("");
        setReplyFiles([]);
        qc.invalidateQueries({ queryKey: ["admin", "support-requests"] });
        qc.invalidateQueries({ queryKey: ["admin", "support-requests", ownerIdFilter ?? ""] });
      }
    } finally {
      setReplySending(false);
    }
  }

  const newCount   = requests.filter((r) => r.status === "new").length;
  const totalCount = requests.length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      {!ownerIdFilter && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Inbox className="w-5 h-5 text-amber-400" />
              صندوق الوارد / طلبات الملاك
            </h2>
            <p className="text-slate-400 text-sm mt-0.5">الرسائل المُرسلة من مركز الدعم في لوحة تحكم الملاك</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <span className="bg-slate-800 border border-slate-700 text-slate-300 text-sm px-3 py-1.5 rounded-lg">
              الإجمالي: <span className="font-bold text-white">{toAr(totalCount)}</span>
            </span>
            {newCount > 0 && (
              <span className="bg-red-900/40 border border-red-700/40 text-red-300 text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                جديد: <span className="font-bold">{toAr(newCount)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700">
          <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">لا توجد رسائل حتى الآن</p>
          {!ownerIdFilter && <p className="text-slate-500 text-sm mt-1">ستظهر هنا الرسائل المُرسلة من الملاك عبر مركز الدعم</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const isExpanded = expandedId === req.id;
            const isReplying = replyingId === req.id;
            const statusInfo = SUPPORT_STATUS_LABELS[req.status] ?? { label: req.status, className: "bg-slate-800 text-slate-400 border border-slate-600" };
            return (
              <div key={req.id} className={`bg-slate-800 border rounded-xl overflow-hidden transition-all ${req.status === "new" ? "border-red-700/50" : "border-slate-700"}`}>
                {/* Row header */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-700/40 transition-colors"
                  onClick={() => { setExpandedId(isExpanded ? null : req.id); if (!isExpanded) setReplyingId(null); }}
                >
                  {req.status === "new" && <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-100 text-sm">{req.owner_name || req.owner_id}</span>
                      <span className="text-slate-500 text-xs">—</span>
                      <span className="text-slate-300 text-sm truncate">{req.subject}</span>
                      {req.admin_reply && (
                        <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-700/30 px-1.5 py-0.5 rounded-full shrink-0">تم الرد</span>
                      )}
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">{fmtDate(req.created_at)}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full shrink-0 ${statusInfo.className}`}>{statusInfo.label}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-700 bg-slate-900/50 px-4 py-4 space-y-4">
                    {/* Original message */}
                    <div>
                      <p className="text-xs text-slate-500 mb-1.5 font-medium">رسالة المالك:</p>
                      <div className="bg-slate-800/80 rounded-lg p-3 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{req.message}</div>
                      {(() => {
                        const urls = req.attachment_urls?.length ? req.attachment_urls : req.attachment_url ? [req.attachment_url] : [];
                        return urls.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {urls.map((url, i) => url.toLowerCase().includes(".pdf") ? (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-xs font-medium text-amber-300 hover:text-amber-200 border border-slate-600 hover:border-amber-500/50 rounded-lg px-3 py-2 bg-slate-800 transition-colors">
                                <FileText className="w-4 h-4 text-red-400 shrink-0" />
                                مرفق PDF {urls.length > 1 ? `(${i + 1})` : ""}
                                <ExternalLink className="w-3 h-3 opacity-60" />
                              </a>
                            ) : (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-fit">
                                <img src={url} alt="مرفق المالك" className="max-h-48 max-w-xs rounded-lg border border-slate-600 object-cover hover:border-amber-500/50 hover:opacity-90 transition-all" />
                              </a>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>

                    {/* Existing reply */}
                    {req.admin_reply && (
                      <div className="space-y-2">
                        <p className="text-xs text-green-500 mb-1.5 font-medium flex items-center gap-1.5">
                          <Send className="w-3 h-3" /> ردّ الإدارة — {req.admin_reply_at ? fmtDate(req.admin_reply_at) : ""}:
                        </p>
                        <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 text-green-200 text-sm leading-relaxed whitespace-pre-wrap">{req.admin_reply}</div>
                        {(() => {
                          const adminUrls = req.admin_attachment_urls?.length ? req.admin_attachment_urls : req.admin_attachment_url ? [req.admin_attachment_url] : [];
                          return adminUrls.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {adminUrls.map((url, i) => url.toLowerCase().includes(".pdf") ? (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-amber-900/30 border border-amber-700/40 text-amber-300 hover:bg-amber-900/50 transition-colors">
                                  <FileText className="w-3.5 h-3.5" />
                                  مرفق PDF {adminUrls.length > 1 ? `(${i + 1})` : ""}
                                  <ExternalLink className="w-3 h-3 opacity-60" />
                                </a>
                              ) : (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-fit">
                                  <img src={url} alt="مرفق الإدارة" className="max-h-48 max-w-xs rounded-lg border border-green-700/40 object-cover hover:border-green-500/50 hover:opacity-90 transition-all" />
                                </a>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {/* Reply form */}
                    {isReplying ? (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-400 font-medium">{req.admin_reply ? "تعديل الرد:" : "كتابة رد:"}</p>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="اكتب ردّك هنا..."
                          rows={4}
                          dir="rtl"
                          className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-amber-500 placeholder:text-slate-500"
                        />
                        {/* File attachment row */}
                        <div className="flex items-center gap-2">
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const newFs = Array.from(e.target.files ?? []);
                              setReplyFiles(prev => [...prev, ...newFs].slice(0, 10));
                              e.target.value = "";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => replyFileInputRef.current?.click()}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 flex items-center gap-1.5"
                          >
                            <Paperclip className="w-3 h-3" />
                            إرفاق ملفات
                          </button>
                          {replyFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-700/60 border border-slate-600 rounded-lg px-2.5 py-1.5 max-w-[160px]">
                              {f.type === "application/pdf"
                                ? <FileText className="w-3 h-3 text-amber-400 shrink-0" />
                                : <ImageIcon className="w-3 h-3 text-blue-400 shrink-0" />}
                              <span className="truncate">{f.name}</span>
                              <button
                                type="button"
                                onClick={() => setReplyFiles(prev => prev.filter((_, j) => j !== i))}
                                className="text-slate-500 hover:text-red-400 shrink-0 ml-0.5"
                              ><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setReplyingId(null); setReplyText(""); setReplyFiles([]); }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600"
                          >إلغاء</button>
                          <button
                            onClick={() => sendReply(req.id)}
                            disabled={!replyText.trim() || replySending}
                            className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 flex items-center gap-1.5"
                          >
                            {replySending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            إرسال الرد
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplyingId(req.id);
                            setReplyText(req.admin_reply ?? "");
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-600/40 text-amber-300 hover:bg-amber-600/30 flex items-center gap-1.5"
                        >
                          <Send className="w-3 h-3" />
                          {req.admin_reply ? "تعديل الرد" : "رد"}
                        </button>
                        <span className="text-slate-600 text-xs">|</span>
                        <span className="text-slate-400 text-xs">الحالة:</span>
                        {(["new", "in_progress", "resolved"] as const).map((s) => (
                          <button
                            key={s}
                            disabled={req.status === s || updating === req.id}
                            onClick={(e) => { e.stopPropagation(); updateStatus(req.id, s); }}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                              req.status === s
                                ? "bg-amber-500/20 border-amber-600 text-amber-200 cursor-default"
                                : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                            }`}
                          >
                            {updating === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : SUPPORT_STATUS_LABELS[s]?.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Section Guides Admin Tab
   ══════════════════════════════════════════════════════════════ */
const GUIDE_SECTIONS = [
  { key: "dashboard",        label: "لوحة الرئيسية" },
  { key: "calendar",         label: "التقويم والحجوزات" },
  { key: "revenues",         label: "الإيرادات" },
  { key: "expenses",         label: "المصروفات" },
  { key: "employees",        label: "الموظفون" },
  { key: "reports",          label: "التقارير المالية" },
  { key: "transactions",     label: "سجل المعاملات المالية" },
  { key: "ledger",           label: "سجل الحساب البنكي" },
  { key: "chalets",          label: "إدارة الشاليهات" },
  { key: "services",         label: "الخدمات والمرافق" },
  { key: "customers",        label: "العملاء" },
  { key: "seasons",          label: "المواسم والأعياد" },
  { key: "reviews",          label: "التقييمات" },
  { key: "deposits",         label: "إدارة التأمينات" },
  { key: "digitalContracts", label: "العقود الرقمية" },
  { key: "messageSettings",  label: "إعدادات الرسائل الآلية" },
] as const;

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch { return null; }
}

type GuideRow = { id: number; sectionKey: string; title: string; videoUrl: string };
type NewEntry = { title: string; url: string; saving: boolean };

function SectionGuidesAdminTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: guides = [] } = useQuery<GuideRow[]>({
    queryKey: ["admin", "section-guides"],
    queryFn: async () => {
      const r = await apiFetch("/admin/section-guides");
      if (!r.ok) return [];
      return r.json();
    },
  });
  const [newEntries, setNewEntries] = useState<Record<string, NewEntry>>({});
  const [showAdd, setShowAdd]       = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]     = useState<Record<number, boolean>>({});

  function toggleAdd(key: string) {
    setShowAdd(s => ({ ...s, [key]: !s[key] }));
    if (!newEntries[key]) setNewEntries(e => ({ ...e, [key]: { title: "", url: "", saving: false } }));
  }

  async function addGuide(key: string) {
    const e = newEntries[key];
    if (!e?.title.trim() || !e?.url.trim()) return;
    setNewEntries(n => ({ ...n, [key]: { ...n[key], saving: true } }));
    try {
      const r = await apiFetch("/admin/section-guides", {
        method: "POST",
        body: JSON.stringify({ sectionKey: key, title: e.title.trim(), videoUrl: e.url.trim() }),
      });
      if (!r.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["admin", "section-guides"] });
      setNewEntries(n => ({ ...n, [key]: { title: "", url: "", saving: false } }));
      setShowAdd(s => ({ ...s, [key]: false }));
      toast({ title: "تمت الإضافة ✓", description: `تمت إضافة "${e.title.trim()}" بنجاح` });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحفظ", variant: "destructive" });
      setNewEntries(n => ({ ...n, [key]: { ...n[key], saving: false } }));
    }
  }

  async function deleteGuide(id: number) {
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      const r = await apiFetch(`/admin/section-guides/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["admin", "section-guides"] });
      toast({ title: "تم الحذف" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحذف", variant: "destructive" });
    } finally {
      setDeleting(d => ({ ...d, [id]: false }));
    }
  }

  return (
    <div className="space-y-5 p-1">
      {/* Header */}
      <div className="flex items-start gap-3 pb-1 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">إدارة شروحات الأقسام</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            أضف فيديوهات يوتيوب لكل قسم — يمكن إضافة أكثر من فيديو للقسم الواحد.
            سيظهر للمالك زر <span className="font-semibold text-primary">شروحات القسم</span> تلقائياً.
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {GUIDE_SECTIONS.map(({ key, label }) => {
          const sectionGuides = guides.filter(g => g.sectionKey === key);
          const entry = newEntries[key] ?? { title: "", url: "", saving: false };
          const isOpen = !!showAdd[key];

          return (
            <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">

              {/* ── Section header row ── */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground leading-none">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 font-mono">{key}</p>
                </div>
                {sectionGuides.length > 0 ? (
                  <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                    {toAr(sectionGuides.length)} فيديو
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground shrink-0">لا يوجد</span>
                )}
                <button
                  onClick={() => toggleAdd(key)}
                  className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    isOpen
                      ? "bg-muted text-muted-foreground hover:bg-muted/80"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {isOpen ? "إلغاء" : "+ إضافة فيديو"}
                </button>
              </div>

              {/* ── Existing videos list ── */}
              {sectionGuides.length > 0 && (
                <div className="border-t border-border divide-y divide-border/60">
                  {sectionGuides.map((g, idx) => (
                    <div key={g.id} className="flex items-center gap-3 px-4 py-2.5 bg-muted/20">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                        {toAr(idx + 1)}
                      </span>
                      <span className="flex-1 text-sm font-medium text-foreground truncate">{g.title}</span>
                      <a
                        href={g.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[11px] text-primary/80 hover:text-primary hover:underline"
                      >
                        معاينة ↗
                      </a>
                      <button
                        onClick={() => deleteGuide(g.id)}
                        disabled={deleting[g.id]}
                        className="shrink-0 text-[11px] font-medium text-red-500 hover:text-red-600 disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        {deleting[g.id] ? "..." : "حذف"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Add video form ── */}
              {isOpen && (
                <div className="border-t border-primary/20 bg-primary/5 px-4 py-4">
                  <p className="text-xs font-bold text-primary mb-3 flex items-center gap-1.5">
                    <Play className="w-3 h-3 fill-primary" />
                    إضافة فيديو شرح جديد
                  </p>
                  <div className="space-y-2.5">
                    {/* Title field */}
                    <div>
                      <label className="block text-[11px] font-semibold text-foreground mb-1">
                        عنوان الفيديو الشارح
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        placeholder="مثال: طريقة إضافة شاليه جديد"
                        value={entry.title}
                        onChange={e => setNewEntries(n => ({ ...n, [key]: { ...n[key], title: e.target.value } }))}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    {/* URL field */}
                    <div>
                      <label className="block text-[11px] font-semibold text-foreground mb-1">
                        رابط يوتيوب (YouTube URL)
                      </label>
                      <input
                        type="url"
                        dir="ltr"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={entry.url}
                        onChange={e => setNewEntries(n => ({ ...n, [key]: { ...n[key], url: e.target.value } }))}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono text-xs"
                      />
                    </div>
                    {/* Save button */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => addGuide(key)}
                        disabled={entry.saving || !entry.title.trim() || !entry.url.trim()}
                        className="h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {entry.saving ? "جاري الحفظ..." : "حفظ الفيديو"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Contact Inquiries Tab
   ══════════════════════════════════════════════════════════════ */
function ContactInquiriesTab() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);

  const { data: inquiries = [], isLoading, refetch } = useQuery<ContactInquiryRow[]>({
    queryKey: ["admin", "contact-inquiries"],
    queryFn: async () => {
      const r = await apiFetch("/admin/contact-inquiries");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  async function updateStatus(id: number, status: string) {
    setStatusUpdating(id);
    try {
      await apiFetch(`/admin/contact-inquiries/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      refetch();
    } finally {
      setStatusUpdating(null);
    }
  }

  const statusLabel = (s: string) => s === "new" ? "جديد" : s === "read" ? "مقروء" : "تمت الإجابة";
  const statusColor = (s: string) => s === "new" ? "bg-amber-500/20 text-amber-300" : s === "read" ? "bg-blue-500/20 text-blue-300" : "bg-green-500/20 text-green-300";
  const newCount = inquiries.filter((i) => i.status === "new").length;

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-blue-400" />
          <h3 className="text-slate-100 font-bold text-lg">رسائل «اتصل بنا»</h3>
          {newCount > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{newCount} جديد</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-slate-600 text-slate-300 hover:text-white">
          تحديث
        </Button>
      </div>

      {inquiries.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <Mail className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">لا توجد رسائل بعد.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <div key={inq.id} className={`bg-slate-800 rounded-xl border overflow-hidden transition-colors ${inq.status === "new" ? "border-amber-500/40" : "border-slate-700"}`}>
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === inq.id ? null : inq.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-100 font-semibold text-sm">{inq.name}</span>
                    {inq.phone && <span className="text-slate-400 text-xs font-mono" dir="ltr">{inq.phone}</span>}
                    {inq.email && <span className="text-slate-500 text-xs">{inq.email}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(inq.status)}`}>{statusLabel(inq.status)}</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5 truncate">{inq.message}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">{new Date(inq.created_at).toLocaleDateString("ar-SA")}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expandedId === inq.id ? "rotate-180" : ""}`} />
                </div>
              </div>

              {expandedId === inq.id && (
                <div className="border-t border-slate-700 px-4 pb-4 pt-3 space-y-3">
                  <div className="bg-slate-900/60 rounded-lg p-3">
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap" dir="rtl">{inq.message}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 me-1">تغيير الحالة:</span>
                    {["new", "read", "replied"].map((s) => (
                      <button key={s} type="button" disabled={inq.status === s || statusUpdating === inq.id}
                        onClick={() => updateStatus(inq.id, s)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${inq.status === s ? statusColor(s) + " border-transparent" : "bg-slate-700 border-slate-600 text-slate-300 hover:text-white"}`}>
                        {statusUpdating === inq.id ? <Loader2 className="w-3 h-3 animate-spin" /> : statusLabel(s)}
                      </button>
                    ))}
                    {inq.phone && (
                      <a href={`https://wa.me/966${inq.phone.replace(/^0/, "").replace(/\D/g, "")}`}
                        target="_blank" rel="noreferrer"
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/30 transition-colors ms-auto">
                        💬 واتساب
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   WA Subscribers Tab — WhatsApp news opt-in list
   ══════════════════════════════════════════════════════════════ */
interface WaSubscriberRow {
  id: number;
  full_name: string | null;
  email: string | null;
  whatsapp_number: string | null;
  chalet_name: string | null;
  whatsapp_news_subscribe: boolean;
  whatsapp_subscribed_at: string | null;
  created_at: string;
}

function WaSubscribersTab() {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "cancelled">("active");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, refetch } = useQuery<WaSubscriberRow[]>({
    queryKey: ["admin", "wa-subscribers"],
    queryFn: async () => {
      const r = await apiFetch("/admin/wa-subscribers");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter === "active"    && !r.whatsapp_news_subscribe) return false;
    if (statusFilter === "cancelled" && r.whatsapp_news_subscribe)  return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.full_name    ?? "").toLowerCase().includes(q) ||
        (r.chalet_name  ?? "").toLowerCase().includes(q) ||
        (r.whatsapp_number ?? "").includes(q)
      );
    }
    return true;
  }), [rows, statusFilter, search]);

  const activeCount    = rows.filter(r => r.whatsapp_news_subscribe).length;
  const cancelledCount = rows.filter(r => !r.whatsapp_news_subscribe).length;

  function exportCSV() {
    const bom = "\uFEFF";
    const header = "الاسم,اسم الشاليه,رقم الواتساب,تاريخ الاشتراك,الحالة";
    const lines = filtered.map(r => {
      const name    = `"${(r.full_name   ?? "").replace(/"/g, '""')}"`;
      const chalet  = `"${(r.chalet_name ?? "").replace(/"/g, '""')}"`;
      const phone   = r.whatsapp_number ?? "";
      const date    = r.whatsapp_subscribed_at
        ? new Date(r.whatsapp_subscribed_at).toLocaleDateString("ar-SA")
        : new Date(r.created_at).toLocaleDateString("ar-SA");
      const status  = r.whatsapp_news_subscribe ? "نشط" : "ملغى";
      return [name, chalet, phone, date, status].join(",");
    });
    const csv  = bom + [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `wa-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openWA(phone: string) {
    const clean = phone.replace(/\D/g, "");
    const intl  = clean.startsWith("0") ? "966" + clean.slice(1) : clean.startsWith("966") ? clean : "966" + clean;
    window.open(`https://wa.me/${intl}`, "_blank", "noopener");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-green-400" />
            قائمة مشتركي أخبار الواتساب
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {toAr(activeCount)} نشط · {toAr(cancelledCount)} ملغى · {toAr(rows.length)} إجمالي
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          تصدير CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        {/* Status pills */}
        <div className="flex gap-2 bg-slate-800/60 rounded-xl p-1">
          {([["all", "الكل"], ["active", "نشط"], ["cancelled", "ملغى"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === v
                  ? "bg-green-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="بحث بالاسم أو الواتساب..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-green-500 transition-colors"
          dir="rtl"
        />

        <button
          onClick={() => refetch()}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white text-sm transition-colors"
        >
          تحديث
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا يوجد مشتركون</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
          <table className="w-full text-sm text-right" dir="rtl">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60">
                <th className="px-4 py-3 text-slate-300 font-semibold">اسم المشترك / الشاليه</th>
                <th className="px-4 py-3 text-slate-300 font-semibold">رقم الواتساب</th>
                <th className="px-4 py-3 text-slate-300 font-semibold">تاريخ الاشتراك</th>
                <th className="px-4 py-3 text-slate-300 font-semibold">الحالة</th>
                <th className="px-4 py-3 text-slate-300 font-semibold text-center">تواصل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((row) => {
                const subscribedDate = row.whatsapp_subscribed_at
                  ? new Date(row.whatsapp_subscribed_at).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })
                  : new Date(row.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
                const isActive = row.whatsapp_news_subscribe;
                return (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{row.full_name ?? "—"}</div>
                      {row.chalet_name && row.chalet_name !== row.full_name && (
                        <div className="text-xs text-slate-400 mt-0.5">{row.chalet_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-slate-200 text-sm" dir="ltr">
                        {row.whatsapp_number ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{subscribedDate}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        isActive
                          ? "bg-green-900/30 text-green-300 border-green-800"
                          : "bg-red-900/30 text-red-300 border-red-800"
                      }`}>
                        {isActive ? "نشط" : "ملغى"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.whatsapp_number ? (
                        <button
                          onClick={() => openWA(row.whatsapp_number!)}
                          title="فتح محادثة واتساب"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-700/80 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          واتساب
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-600 text-center">
        {toAr(filtered.length)} نتيجة من أصل {toAr(rows.length)} · مرتّب حسب الأحدث أولاً
      </p>
    </div>
  );
}

const ALL_TABS = [
  { id: "overview",                label: "الإحصائيات",            icon: BarChart3 },
  { id: "chalets",                 label: "قائمة العقارات",        icon: Home },
  { id: "submissions",             label: "الطلبات/الحجوزات",      icon: Settings },
  { id: "partnerApplications",     label: "طلبات الملاك",          icon: Users },
  { id: "platformRevenue",         label: "ميزانية المنصة",        icon: TrendingUp },
  { id: "services",                label: "خدمات المناسبات",       icon: Wrench },
  { id: "serviceCategories",       label: "فئات الخدمات",          icon: Tag },
  { id: "expenseCategories",       label: "فئات المصروفات",        icon: Tag },
  { id: "locations",               label: "المدن والأحياء",        icon: Building2 },
  { id: "amenities",               label: "المرافق",                icon: Tag },
  { id: "categories",              label: "فئات العقارات",         icon: Tag },
  { id: "owners",                  label: "الملاك",                 icon: Users },
  { id: "plans",                   label: "خطط الاشتراك",          icon: CreditCard },
  { id: "reviews",                 label: "تقييمات العملاء",       icon: Star },
  { id: "ownerInbox",              label: "صندوق الوارد",          icon: Inbox },
  { id: "contactInquiries",        label: "رسائل التواصل",         icon: Mail },
  { id: "waSubscribers",           label: "قائمة المشتركين",       icon: Smartphone },
  { id: "siteSettings",            label: "إعدادات الموقع",        icon: Settings },
  { id: "communicationSettings",   label: "إعدادات التواصل",       icon: Mail },
  { id: "termsManagement",         label: "شروط الاستخدام",        icon: FileCheck },
  { id: "sectionGuides",           label: "شروحات الأقسام",        icon: BookOpen },
  { id: "adminStaff",              label: "موظفو الإدارة",         icon: Shield },
  { id: "directAdd",               label: "إضافة شاليه / مالك",   icon: Plus },
] as const;

type TabId = typeof ALL_TABS[number]["id"];

const ADMIN_NAV_GROUPS: Array<{
  id: string;
  label: string;
  icon: typeof BarChart3;
  tabs: TabId[];
}> = [
  { id: "dashboard", label: "الإحصائيات", icon: BarChart3, tabs: ["overview"] },
  { id: "properties", label: "إدارة العقارات", icon: Home, tabs: ["chalets", "categories", "serviceCategories", "amenities", "locations"] },
  { id: "users", label: "إدارة المستخدمين", icon: Users, tabs: ["owners", "partnerApplications", "ownerInbox", "adminStaff"] },
  { id: "operations", label: "العمليات", icon: Calendar, tabs: ["submissions", "reviews", "waSubscribers", "services"] },
  { id: "finance", label: "المالية", icon: DollarSign, tabs: ["platformRevenue", "plans", "expenseCategories"] },
  { id: "settings", label: "الإعدادات", icon: Settings, tabs: ["siteSettings", "communicationSettings", "contactInquiries", "termsManagement", "sectionGuides"] },
];

/* ══════════════════════════════════════════════════════════════
   Reviews Tab — generate invitation links, view submitted reviews
   ══════════════════════════════════════════════════════════════ */
interface ReviewChalet { id: number; nameAr: string; photos: string[] }
interface AdminReviewRow {
  id: number;
  chaletId: number;
  chaletName: string | null;
  rating: number;
  comment: string | null;
  photoUrls: string[];
  isVerified: boolean;
  isHidden: boolean;
  ownerReply: string | null;
  ownerReplyAt: string | null;
  reportedBy: string | null;
  reportedAt: string | null;
  reportReason: string | null;
  createdAt: string;
}

const DEFAULT_REVIEW_TEMPLATE = "أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} 🌟\nاضغط هنا لتقييمك: {link}";

function ReviewsTab() {
  const qc = useQueryClient();
  const [generatedLinks, setGeneratedLinks] = useState<Record<number, string>>({});
  const [expandedChalet, setExpandedChalet] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/page-content`);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: chalets = [], isLoading } = useQuery<ReviewChalet[]>({
    queryKey: ["admin", "chalets-list"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/chalets`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const { data: invitations = [] } = useQuery<{ chaletId: number; used: boolean; token: string }[]>({
    queryKey: ["admin", "review-invitations"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/review-invitations`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const { data: allReviews = [] } = useQuery<AdminReviewRow[]>({
    queryKey: ["admin", "all-reviews"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/reviews`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const generateLink = useMutation({
    mutationFn: async (chaletId: number) => {
      const r = await fetch(`${API}/admin/chalets/${chaletId}/review-invite`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ token: string; chaletName: string }>;
    },
    onSuccess: (data, chaletId) => {
      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const link = `${origin}${base}/r/${data.token}`;
      setGeneratedLinks((prev) => ({ ...prev, [chaletId]: link }));
      qc.invalidateQueries({ queryKey: ["admin", "review-invitations"] });
    },
  });

  function copyLink(chaletId: number) {
    const link = generatedLinks[chaletId];
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedId(chaletId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const dismissReport = useMutation({
    mutationFn: async (reviewId: number) => {
      const r = await fetch(`${API}/admin/reviews/${reviewId}/dismiss-report`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "all-reviews"] }),
  });

  const deleteReviewDispute = useMutation({
    mutationFn: async (reviewId: number) => {
      const r = await fetch(`${API}/admin/reviews/${reviewId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "all-reviews"] }),
  });

  function sendWhatsApp(chaletId: number, chaletName: string) {
    const link = generatedLinks[chaletId];
    if (!link) return;
    const template = siteSettings.wa_review_template || DEFAULT_REVIEW_TEMPLATE;
    const text = template
      .replace(/\{link\}/g, link)
      .replace(/\{chalet_name\}/g, chaletName ?? "شاليهنا")
      .replace(/\{guest_name\}/g, "");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function inviteStats(chaletId: number) {
    const all = invitations.filter((i) => i.chaletId === chaletId);
    return { total: all.length, used: all.filter((i) => i.used).length, pending: all.filter((i) => !i.used).length };
  }

  const reportedReviews = allReviews.filter((r) => r.reportedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">إدارة التقييمات</h2>
          <p className="text-slate-400 text-sm mt-1">أنشئ روابط تقييم للضيوف وشاهد التقييمات الواردة</p>
        </div>
      </div>

      {/* ══ Dispute Center ══ */}
      {reportedReviews.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-amber-800/40">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <span className="text-white font-semibold text-sm">مركز الشكاوى</span>
              <span className="text-amber-400 text-xs mr-2">{reportedReviews.length} بلاغ معلق</span>
            </div>
          </div>
          <div className="divide-y divide-amber-900/30">
            {reportedReviews.map((rev) => (
              <div key={rev.id} className="px-5 py-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-300 text-sm font-semibold">{rev.chaletName ?? `شاليه #${rev.chaletId}`}</span>
                  <div className="flex gap-0.5" dir="ltr">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} className="w-3.5 h-3.5" fill={s <= rev.rating ? "#f59e0b" : "transparent"} stroke={s <= rev.rating ? "#f59e0b" : "#475569"} strokeWidth={1.5} />
                    ))}
                  </div>
                  {rev.isVerified && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                  <span className="text-slate-500 text-xs mr-auto">
                    أُبلغ عنه: {fmtDate(rev.reportedAt)}
                  </span>
                </div>
                {rev.comment && <p className="text-slate-400 text-sm leading-relaxed">"{rev.comment}"</p>}
                {rev.reportReason && (
                  <div className="flex items-start gap-1.5 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-amber-300 text-xs leading-relaxed"><span className="font-semibold">سبب البلاغ:</span> {rev.reportReason}</p>
                  </div>
                )}
                {rev.isHidden && <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">مخفي بالفعل</span>}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-3 border-green-800 text-green-400 hover:bg-green-900/30"
                    disabled={dismissReport.isPending}
                    onClick={() => dismissReport.mutate(rev.id)}
                  >
                    رفض البلاغ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-3 border-red-800 text-red-400 hover:bg-red-900/30"
                    disabled={deleteReviewDispute.isPending}
                    onClick={() => {
                      if (window.confirm("هل أنت متأكد من حذف هذا التقييم نهائياً؟")) {
                        deleteReviewDispute.mutate(rev.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    حذف التقييم
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-slate-400 py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : chalets.length === 0 ? (
        <div className="text-center text-slate-400 py-16">لا توجد شاليهات مضافة بعد</div>
      ) : (
        <div className="space-y-3">
          {chalets.map((c) => {
            const stats = inviteStats(c.id);
            const link = generatedLinks[c.id];
            const isExpanded = expandedChalet === c.id;

            return (
              <div key={c.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* Chalet row */}
                <div className="flex items-center gap-4 p-4">
                  {c.photos?.[0] ? (
                    <img src={c.photos[0]} alt={c.nameAr} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                      <Star className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{c.nameAr}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {stats.total === 0 ? "لا توجد دعوات" : `${stats.total} دعوة — ${stats.used} مستخدمة · ${stats.pending} معلقة`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs gap-1.5"
                      onClick={() => setExpandedChalet(isExpanded ? null : c.id)}
                    >
                      <Star className="w-3.5 h-3.5" />
                      التقييمات
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1.5"
                      disabled={generateLink.isPending && generateLink.variables === c.id}
                      onClick={() => generateLink.mutate(c.id)}
                    >
                      {generateLink.isPending && generateLink.variables === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      إنشاء رابط تقييم
                    </Button>
                  </div>
                </div>

                {/* Generated Link Area */}
                {link && (
                  <div className="border-t border-slate-700 bg-slate-900/60 px-4 py-3 space-y-2">
                    <p className="text-slate-400 text-xs font-medium mb-1">رابط التقييم الجديد:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-slate-800 text-green-400 text-xs px-3 py-2 rounded-lg border border-slate-600 truncate font-mono">
                        {link}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs shrink-0"
                        onClick={() => copyLink(c.id)}
                      >
                        {copiedId === c.id ? "✓ تم النسخ" : "نسخ"}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#25D366] hover:bg-[#1ebe5a] text-white text-xs shrink-0 gap-1.5"
                        onClick={() => sendWhatsApp(c.id, c.nameAr)}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        واتساب
                      </Button>
                    </div>
                  </div>
                )}

                {/* Reviews list (expandable) */}
                {isExpanded && <ChaletReviewsList chaletId={c.id} reviews={allReviews.filter((r) => r.chaletId === c.id)} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChaletReviewsList({ chaletId, reviews }: { chaletId: number; reviews: AdminReviewRow[] }) {
  const qc = useQueryClient();

  const hideReview = useMutation({
    mutationFn: async ({ id, hide }: { id: number; hide: boolean }) => {
      const r = await fetch(`${API}/admin/reviews/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: hide }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "all-reviews"] }),
  });

  const deleteReview = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/admin/reviews/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "all-reviews"] }),
  });

  return (
    <div className="border-t border-slate-700 px-4 py-4">
      {reviews.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-2">لا توجد تقييمات بعد لهذا الشاليه</p>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-300 text-sm font-semibold mb-2">{reviews.length} تقييم</p>
          {reviews.map((rev) => (
            <div key={rev.id} className={`rounded-lg p-3 border ${rev.isHidden ? "bg-slate-900/60 border-red-900/50 opacity-70" : "bg-slate-800/60 border-slate-700"}`}>
              {/* Header row */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <div className="flex gap-0.5" dir="ltr">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} className="w-4 h-4" fill={s <= rev.rating ? "#f59e0b" : "transparent"} stroke={s <= rev.rating ? "#f59e0b" : "#475569"} strokeWidth={1.5} />
                  ))}
                </div>
                {rev.isVerified && (
                  <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> مؤكد
                  </span>
                )}
                {rev.isHidden && (
                  <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full">مخفي</span>
                )}
                {rev.reportedAt && (
                  <span className="text-xs bg-amber-900/40 text-amber-400 px-2 py-0.5 rounded-full">مُبلَّغ عنه</span>
                )}
                <span className="text-slate-500 text-xs mr-auto">
                  {fmtDate(rev.createdAt)}
                </span>
              </div>

              {rev.comment && <p className="text-slate-300 text-sm leading-relaxed">{rev.comment}</p>}

              {rev.photoUrls?.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {rev.photoUrls.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-14 h-14 rounded object-cover border border-slate-600 cursor-pointer"
                      onClick={() => window.open(url, "_blank")}
                    />
                  ))}
                </div>
              )}

              {/* Owner reply preview */}
              {rev.ownerReply && (
                <div className="mt-2 p-2 bg-green-900/20 border border-green-900/40 rounded-lg">
                  <p className="text-xs text-green-400 font-medium mb-0.5">رد صاحب الشاليه:</p>
                  <p className="text-slate-300 text-xs leading-relaxed">{rev.ownerReply}</p>
                </div>
              )}

              {/* Admin action buttons */}
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-700">
                <Button
                  size="sm"
                  variant="outline"
                  className={`text-xs h-7 px-2 gap-1 ${rev.isHidden ? "border-green-700 text-green-400 hover:bg-green-900/30" : "border-slate-600 text-slate-400 hover:bg-slate-700"}`}
                  disabled={hideReview.isPending}
                  onClick={() => hideReview.mutate({ id: rev.id, hide: !rev.isHidden })}
                >
                  {rev.isHidden ? "إظهار التقييم" : "إخفاء التقييم"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 px-2 gap-1 border-red-800 text-red-400 hover:bg-red-900/30"
                  disabled={deleteReview.isPending}
                  onClick={() => {
                    if (window.confirm("هل أنت متأكد من حذف هذا التقييم نهائياً؟")) {
                      deleteReview.mutate(rev.id);
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                  حذف نهائي
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   AdminStaffTab — Platform admin staff management (super admin only)
   ══════════════════════════════════════════════════════════════ */
interface AdminStaffRow {
  id: number;
  name: string;
  username: string;
  permissions: AdminStaffPermissions;
  isActive: boolean;
  createdAt: string;
}

function AdminStaffTab({ isSuperAdmin = false, currentUserName = "" }: { isSuperAdmin?: boolean; currentUserName?: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [permEditId, setPermEditId] = useState<number | null>(null);
  const [credEditId, setCredEditId] = useState<number | null>(null);

  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPerms, setNewPerms] = useState<AdminStaffPermissions>({});

  const [editCredUsername, setEditCredUsername] = useState("");
  const [editCredPassword, setEditCredPassword] = useState("");
  const [editPerms, setEditPerms] = useState<AdminStaffPermissions>({});

  /* Change own password */
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const changePwdMutation = useMutation({
    mutationFn: async () => {
      if (pwdNew !== pwdConfirm) throw new Error("كلمة المرور الجديدة وتأكيدها غير متطابقين");
      if (pwdNew.length < 8) throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      const r = await fetch(`${API}/admin/change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "فشل تغيير كلمة المرور"); }
      return r.json();
    },
    onSuccess: () => { setPwdSuccess(true); setPwdCurrent(""); setPwdNew(""); setPwdConfirm(""); setPwdError(""); },
    onError: (e: Error) => setPwdError(e.message),
  });

  const { data: staffList = [], isLoading } = useQuery<AdminStaffRow[]>({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/staff`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/admin/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName, username: newUsername, password: newPassword, permissions: newPerms }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "فشل الحفظ"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      setShowAdd(false);
      setNewName(""); setNewUsername(""); setNewPassword(""); setNewPerms({});
    },
  });

  const permMutation = useMutation({
    mutationFn: async ({ id, permissions }: { id: number; permissions: AdminStaffPermissions }) => {
      const r = await fetch(`${API}/admin/staff/${id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ permissions }),
      });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "staff"] }); setPermEditId(null); },
  });

  const credMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const r = await fetch(`${API}/admin/staff/${id}/credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: editCredUsername || undefined, password: editCredPassword || undefined }),
      });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "staff"] }); setCredEditId(null); setEditCredUsername(""); setEditCredPassword(""); },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await fetch(`${API}/admin/staff/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/admin/staff/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
  });

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">موظفو الإدارة العامة</h2>
          <p className="text-slate-400 text-sm mt-1">
            إدارة حسابات موظفي المنصة وصلاحياتهم — {toAr(staffList.length)} موظف
          </p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          إضافة موظف
        </Button>
      </div>

      {/* Super Admin Identity Card */}
      {isSuperAdmin && (<>
        <div className="mb-6 bg-gradient-to-l from-amber-900/20 to-amber-800/10 border border-amber-600/30 rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-white font-bold text-base">{currentUserName}</span>
              <span className="bg-amber-500/20 text-amber-400 text-xs px-2.5 py-0.5 rounded-full border border-amber-500/30 font-semibold">
                مشرف عام
              </span>
            </div>
            <p className="text-slate-400 text-sm">حسابك هو حساب المشرف العام — يمتلك صلاحيات كاملة وغير محدودة على جميع أقسام المنصة. لا يمكن تقييد هذا الحساب.</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400 bg-green-900/20 border border-green-700/30 px-3 py-1.5 rounded-lg">
              <CheckCircle className="w-3.5 h-3.5" />
              مفعّل
            </span>
            <button
              onClick={() => { setShowChangePwd(true); setPwdSuccess(false); setPwdError(""); }}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              تغيير كلمة المرور
            </button>
          </div>
        </div>

        {/* Change Password Panel */}
        {showChangePwd && (
          <div className="mt-4 border-t border-amber-600/20 pt-4">
            {pwdSuccess ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                تم تغيير كلمة المرور بنجاح!
                <button onClick={() => { setShowChangePwd(false); setPwdSuccess(false); }} className="mr-auto text-slate-400 hover:text-white text-xs">إغلاق</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-slate-300 text-sm font-medium">تغيير كلمة المرور</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">كلمة المرور الحالية</label>
                    <Input type="password" value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} placeholder="••••••••" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">كلمة المرور الجديدة</label>
                    <Input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} placeholder="••••••••" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">تأكيد كلمة المرور</label>
                    <Input type="password" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)} placeholder="••••••••" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" />
                  </div>
                </div>
                {pwdError && <p className="text-red-400 text-xs">{pwdError}</p>}
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowChangePwd(false)} className="text-slate-400 hover:text-white text-xs h-7">إلغاء</Button>
                  <Button size="sm" onClick={() => changePwdMutation.mutate()} disabled={!pwdCurrent || !pwdNew || !pwdConfirm || changePwdMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7">
                    {changePwdMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ كلمة المرور"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </> )}

      {/* Add Form */}
      {showAdd && (
        <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 mb-6">
          <h3 className="text-white font-bold mb-4">إضافة موظف إدارة جديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">الاسم الكامل</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم الموظف"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">اسم المستخدم</label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="username"
                dir="ltr"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">كلمة المرور</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Permission toggles */}
          <div className="mb-4">
            <p className="text-sm text-slate-400 mb-3">الصلاحيات الممنوحة:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ALL_ADMIN_PERM_KEYS.map((key) => {
                const info = ADMIN_PERM_LABELS[key];
                const enabled = !!newPerms[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNewPerms((p) => ({ ...p, [key]: !enabled }))}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-right transition-colors border ${
                      enabled
                        ? "bg-amber-900/30 border-amber-600 text-amber-300"
                        : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    <span className="text-base shrink-0">{info.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{info.label}</div>
                      <div className="text-xs text-slate-400 truncate">{info.description}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      enabled ? "bg-amber-500 border-amber-500" : "border-slate-500"
                    }`}>
                      {enabled && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white">
              إلغاء
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!newName || !newUsername || !newPassword || addMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ الموظف"}
            </Button>
          </div>
          {addMutation.isError && (
            <p className="text-red-400 text-sm mt-2 text-right">{(addMutation.error as Error)?.message}</p>
          )}
        </div>
      )}

      {/* Staff List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
          <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">لا يوجد موظفو إدارة حتى الآن</p>
          <p className="text-slate-500 text-sm mt-1">أضف موظفاً للبدء في تفويض الصلاحيات</p>
        </div>
      ) : (
        <div className="space-y-4">
          {staffList.map((member) => {
            const activePerms = ALL_ADMIN_PERM_KEYS.filter((k) => member.permissions?.[k]);
            const isPermOpen = permEditId === member.id;
            const isCredOpen = credEditId === member.id;

            return (
              <div key={member.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* Card header */}
                <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-900/40 border border-amber-700/30 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold">{member.name}</span>
                      <span className="text-slate-500 text-xs font-mono">@{member.username}</span>
                      {!member.isActive && (
                        <span className="bg-red-900/40 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-800">موقوف</span>
                      )}
                    </div>
                    {activePerms.length === 0 ? (
                      <p className="text-slate-500 text-xs mt-1">لا توجد صلاحيات ممنوحة</p>
                    ) : (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {activePerms.map((k) => (
                          <span key={k} className="inline-flex items-center gap-1 bg-amber-900/30 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                            {ADMIN_PERM_LABELS[k].icon} {ADMIN_PERM_LABELS[k].label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setCredEditId(isCredOpen ? null : member.id); setPermEditId(null); setEditCredUsername(member.username); setEditCredPassword(""); }}
                      className="text-xs text-slate-400 hover:text-amber-400 px-2 py-1 rounded border border-slate-600 hover:border-amber-600 transition-colors"
                    >
                      بيانات الدخول
                    </button>
                    <button
                      onClick={() => { setPermEditId(isPermOpen ? null : member.id); setCredEditId(null); setEditPerms({ ...member.permissions }); }}
                      className="text-xs text-slate-400 hover:text-amber-400 px-2 py-1 rounded border border-slate-600 hover:border-amber-600 transition-colors"
                    >
                      الصلاحيات
                    </button>
                    <button
                      onClick={() => statusMutation.mutate({ id: member.id, isActive: !member.isActive })}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        member.isActive
                          ? "text-slate-400 hover:text-yellow-400 border-slate-600 hover:border-yellow-600"
                          : "text-green-400 hover:text-green-300 border-green-700 hover:border-green-500"
                      }`}
                    >
                      {member.isActive ? "تعطيل" : "تفعيل"}
                    </button>
                    <button
                      onClick={() => { if (confirm("هل تريد حذف هذا الموظف نهائياً؟")) deleteMutation.mutate(member.id); }}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Credential Editor */}
                {isCredOpen && (
                  <div className="border-t border-slate-700 bg-slate-900/40 p-4">
                    <p className="text-slate-300 text-sm font-medium mb-3">تعديل بيانات الدخول</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">اسم المستخدم الجديد</label>
                        <Input
                          value={editCredUsername}
                          onChange={(e) => setEditCredUsername(e.target.value)}
                          placeholder={member.username}
                          dir="ltr"
                          className="bg-slate-700 border-slate-600 text-white text-sm h-8"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">كلمة مرور جديدة (اتركها فارغة لعدم التغيير)</label>
                        <Input
                          type="password"
                          value={editCredPassword}
                          onChange={(e) => setEditCredPassword(e.target.value)}
                          placeholder="••••••••"
                          className="bg-slate-700 border-slate-600 text-white text-sm h-8"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setCredEditId(null)} className="text-slate-400 hover:text-white text-xs h-7">إلغاء</Button>
                      <Button
                        size="sm"
                        onClick={() => credMutation.mutate({ id: member.id })}
                        disabled={credMutation.isPending}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7"
                      >
                        {credMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Permission Editor */}
                {isPermOpen && (
                  <div className="border-t border-slate-700 bg-slate-900/40 p-4">
                    <p className="text-slate-300 text-sm font-medium mb-3">تعديل الصلاحيات</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                      {ALL_ADMIN_PERM_KEYS.map((key) => {
                        const info = ADMIN_PERM_LABELS[key];
                        const enabled = !!editPerms[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setEditPerms((p) => ({ ...p, [key]: !enabled }))}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-right transition-colors border ${
                              enabled
                                ? "bg-amber-900/30 border-amber-600 text-amber-300"
                                : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                            }`}
                          >
                            <span className="text-base shrink-0">{info.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{info.label}</div>
                              <div className="text-xs text-slate-400 truncate">{info.description}</div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              enabled ? "bg-amber-500 border-amber-500" : "border-slate-500"
                            }`}>
                              {enabled && <CheckCircle className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setPermEditId(null)} className="text-slate-400 hover:text-white text-xs h-7">إلغاء</Button>
                      <Button
                        size="sm"
                        onClick={() => permMutation.mutate({ id: member.id, permissions: editPerms })}
                        disabled={permMutation.isPending}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7"
                      >
                        {permMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ الصلاحيات"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [, setLocation]         = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { adminStaffUser, isAdminStaff, permissions: adminPerms, isLoading: staffLoading, logout: adminStaffLogout } = useAdminStaffAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [directAddMode, setDirectAddMode] = useState<DirectAddMode>("property");

  const { data: accessCheck, isLoading: checkLoading, error: checkError } = useQuery({
    queryKey: ["admin", "access-check"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/access-check`, { credentials: "include" });
      if (r.status === 401) throw new Error("401");
      if (r.status === 403) throw new Error("403");
      return r.json() as Promise<{ role: "superAdmin" | "adminStaff"; permissions: Record<string, boolean> }>;
    },
    retry: false,
    enabled: isAuthenticated || isAdminStaff,
  });

  const isSuperAdmin = accessCheck?.role === "superAdmin";

  /* ── New support-request count for badge ── */
  const { data: supportRequests = [] } = useQuery<OwnerSupportRequest[]>({
    queryKey: ["admin", "support-requests"],
    queryFn: async () => {
      const r = await apiFetch("/admin/support-requests");
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: isAuthenticated || isAdminStaff,
  });
  const newSupportCount = supportRequests.filter((r) => r.status === "new").length;

  const tabs = useMemo(() => {
    if (isSuperAdmin) return ALL_TABS;
    return ALL_TABS.filter((tab) => {
      const permKey = ADMIN_TAB_PERMISSION[tab.id];
      if (!permKey || permKey === "__superadmin__") return false;
      return adminPerms[permKey as AdminPermKey] === true;
    });
  }, [isSuperAdmin, adminPerms]);

  const tabById = useMemo(() => {
    return Object.fromEntries(tabs.map((tab) => [tab.id, tab])) as Partial<Record<TabId, typeof ALL_TABS[number]>>;
  }, [tabs]);

  const navGroups = useMemo(() => {
    return ADMIN_NAV_GROUPS
      .map((group) => ({
        ...group,
        tabs: group.tabs.map((id) => tabById[id]).filter(Boolean) as Array<typeof ALL_TABS[number]>,
      }))
      .filter((group) => group.tabs.length > 0);
  }, [tabById]);

  const visibleTabIds = useMemo(() => new Set(navGroups.flatMap((group) => group.tabs.map((tab) => tab.id))), [navGroups]);

  useEffect(() => {
    if (activeTab !== "directAdd" && tabs.length > 0 && (!tabs.find((t) => t.id === activeTab) || !visibleTabIds.has(activeTab))) {
      const firstVisible = navGroups[0]?.tabs[0]?.id ?? tabs[0].id;
      setActiveTab(firstVisible as TabId);
    }
  }, [tabs, navGroups, visibleTabIds, activeTab]);

  const isLoading = authLoading || staffLoading || checkLoading;

  /* ── Redirect to /admin-login if not authenticated as admin staff ── */
  useEffect(() => {
    if (!authLoading && !staffLoading && !isAuthenticated && !isAdminStaff) {
      setLocation("/admin-login");
    }
  }, [authLoading, staffLoading, isAuthenticated, isAdminStaff, setLocation]);

  if (isLoading || (!isAuthenticated && !isAdminStaff)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-400 w-10 h-10" />
      </div>
    );
  }

  if (checkError?.message === "403" || checkError?.message === "401") {
    if (isAuthenticated && !isAdminStaff) {
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
                onClick={() => { if (user?.id) navigator.clipboard.writeText(user.id); }}
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
  }

  const displayName = isAdminStaff
    ? adminStaffUser?.name
    : [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-slate-900 text-white" dir="rtl">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSuperAdmin ? "bg-amber-500" : "bg-slate-600"}`}>
            {isSuperAdmin ? <Settings className="w-5 h-5 text-white" /> : <Shield className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">لوحة التحكم</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              {isSuperAdmin ? "المشرف العام — منصة تكية للحجوزات" : `موظف إدارة — ${adminStaffUser?.name ?? ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm hidden sm:block">{displayName}</span>
          {isAdminStaff && (
            <button
              onClick={() => adminStaffLogout()}
              className="text-slate-400 hover:text-red-400 text-sm transition-colors"
            >
              تسجيل الخروج
            </button>
          )}
          {isSuperAdmin && (
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                  <Plus className="w-3.5 h-3.5" />
                  إضافة جديد
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52 border-slate-700 bg-slate-900 p-2 text-slate-100 shadow-2xl">
                <DropdownMenuItem
                  onClick={() => { setDirectAddMode("property"); setActiveTab("directAdd"); }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm text-slate-300 transition-colors focus:bg-slate-800 focus:text-white"
                >
                  <Home className="w-4 h-4 text-amber-400" />
                  إضافة عقار جديد
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setDirectAddMode("owner"); setActiveTab("directAdd"); }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm text-slate-300 transition-colors focus:bg-slate-800 focus:text-white"
                >
                  <Users className="w-4 h-4 text-sky-400" />
                  إضافة مالك جديد
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setDirectAddMode("service"); setActiveTab("directAdd"); }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm text-slate-300 transition-colors focus:bg-slate-800 focus:text-white"
                >
                  <Wrench className="w-4 h-4 text-emerald-400" />
                  إضافة مزود خدمة
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            onClick={async () => {
              const r = await apiFetch("/admin/demo-preview", { method: "POST" });
              if (r.ok) window.location.href = `${BASE}/dashboard`;
              else alert("تعذّر تشغيل وضع التجربة");
            }}
            className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            لوحة تحكم الملاك (تجربة)
          </button>
          <a
            href={`${BASE}/`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            معاينة المنصة العامة
          </a>
          <a href={BASE || "/"} className="text-slate-400 hover:text-white text-sm transition-colors">
            العودة ←
          </a>
        </div>
      </header>

      {/* Admin Staff info banner — only shown for non-super-admin staff */}
      {isAdminStaff && !isSuperAdmin && (
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-2 flex items-center gap-2 text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          <span>أنت مسجل دخولك كموظف إدارة — الصلاحيات المتاحة لك فقط هي المحددة من قبل المشرف العام</span>
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="bg-slate-900 border-b border-slate-700 px-6">
        <div className="flex gap-2 overflow-x-auto py-2">
          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const isGroupActive = group.tabs.some((tab) => tab.id === activeTab);
            const firstTab = group.tabs[0];

            if (group.id === "dashboard" && firstTab) {
              return (
                <button
                  key={group.id}
                  onClick={() => setActiveTab(firstTab.id as TabId)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
                    isGroupActive
                      ? "border-amber-500 bg-amber-500/20 text-amber-100 font-extrabold shadow-sm shadow-amber-900/20"
                      : "border-slate-700 bg-slate-800/70 text-slate-300 font-bold hover:border-slate-500 hover:text-white"
                  }`}
                >
                  <GroupIcon className={`w-4 h-4 ${isGroupActive ? "text-amber-300" : "text-slate-400"}`} />
                  {group.label}
                </button>
              );
            }

            const isUsers = group.id === "users";
            const usersBadge = isUsers && newSupportCount > 0 ? newSupportCount : 0;

            return (
              <DropdownMenu key={group.id} dir="rtl">
                <DropdownMenuTrigger asChild>
                  <button
                    className={`relative flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors whitespace-nowrap outline-none ${
                      isGroupActive
                        ? "border-amber-500 bg-amber-500/20 text-amber-100 font-extrabold shadow-sm shadow-amber-900/20"
                        : "border-slate-700 bg-slate-800/70 text-slate-300 font-bold hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    <GroupIcon className={`w-4 h-4 ${isGroupActive ? "text-amber-300" : "text-slate-400"}`} />
                    {group.label}
                    {usersBadge > 0 && (
                      <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-md">
                        {usersBadge}
                      </span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 ${isGroupActive ? "text-amber-300" : "opacity-70"}`} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-64 border-slate-700 bg-slate-900 p-3 text-slate-100 shadow-2xl">
                  {group.tabs.map(({ id, label, icon: Icon }) => (
                    <DropdownMenuItem
                      key={id}
                      onClick={() => setActiveTab(id as TabId)}
                      className={`flex cursor-pointer items-center justify-between rounded-xl px-3.5 py-3 text-sm transition-colors focus:bg-slate-800 focus:text-white ${
                        activeTab === id ? "bg-amber-500/15 text-amber-200" : "text-slate-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {label}
                        {id === "ownerInbox" && newSupportCount > 0 && (
                          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                            {newSupportCount}
                          </span>
                        )}
                      </span>
                      {activeTab === id && <Check className="w-4 h-4 text-amber-300" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="p-6 max-w-7xl mx-auto">
        {activeTab === "overview"             && <OverviewTab />}
        {activeTab === "chalets"              && <ChaletsVerifyTab />}
        {activeTab === "submissions"          && <SubmissionsTab isSuperAdmin={isSuperAdmin} />}
        {activeTab === "partnerApplications" && <PartnerApplicationsTab />}
        {activeTab === "platformRevenue"      && <PlatformRevenueTab />}
        {activeTab === "services"             && <ServicesTab />}
        {activeTab === "serviceCategories"   && <ServiceCategoriesTab />}
        {activeTab === "expenseCategories"   && <ExpenseCategoriesTab />}
        {activeTab === "locations"           && <LocationsTab />}
        {activeTab === "amenities"           && <AmenitiesTab />}
        {activeTab === "categories"          && <CategoriesTab />}
        {activeTab === "owners"              && <OwnersTab isSuperAdmin={isSuperAdmin} />}
        {activeTab === "plans"               && <PlansTab />}
        {activeTab === "reviews"             && <ReviewsTab />}
        {activeTab === "ownerInbox"          && <OwnerInboxTab />}
        {activeTab === "contactInquiries"      && <ContactInquiriesTab />}
        {activeTab === "waSubscribers"         && <WaSubscribersTab />}
        {activeTab === "siteSettings"          && <SettingsTab />}
        {activeTab === "communicationSettings" && <CommunicationSettingsTab />}
        {activeTab === "termsManagement"     && <TermsManagementTab />}
        {activeTab === "sectionGuides"       && <SectionGuidesAdminTab />}
        {activeTab === "adminStaff"          && <AdminStaffTab isSuperAdmin={isSuperAdmin} currentUserName={displayName ?? ""} />}
        {activeTab === "directAdd"           && <DirectAddTab mode={directAddMode} />}
      </main>
    </div>
  );
}
