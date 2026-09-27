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
  hasAdminPermission,
  type AdminPermKey,
  type AdminStaffPermissions,
} from "@/lib/adminPermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, Trash2, CheckCircle, XCircle, MapPin, Settings, Users, Tag, Building2, Wrench, Plus, Edit2, Phone, Eye, EyeOff, Calendar, ShieldCheck, ShieldOff, Shield, Clock, Zap, Globe, Heart, ExternalLink, Instagram, Twitter, AlertTriangle, RotateCcw, Home, DoorOpen, Star, Image as ImageIcon, ChevronLeft, ChevronRight, ChevronDown, GripVertical, ToggleLeft, ToggleRight, CreditCard, Save, X, Upload, Palette, TrendingUp, DollarSign, BarChart3, FileCheck, FileText, Check, Video, Mail, MessageSquare, Send, Inbox, Smartphone, Download, Paperclip, BookOpen, Play, ClipboardList, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChaletDiamondContent } from "@/components/chalet/ChaletDiamondContent";
import { OverviewTab } from "./admin/OverviewTab";
import { CentralSettingsTab } from "./admin/CentralSettingsTab";
import { ContactInquiriesTab } from "./admin/ContactInquiriesTab";
import { AuditLogsTab } from "./admin/AuditLogsTab";
import { ChaletDetailsModal, type ChaletDetails } from "./admin/ChaletDetailsModal";

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
  region?: string | null;
  suggestedCityName?: string | null;
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

interface AdminChalet extends ChaletDetails {
  submissionId?: number | null;
  isActive?: boolean;
  isPausedNow?: boolean;
  hiddenByOwner?: boolean;
  pausedFrom?: string | null;
  pausedUntil?: string | null;
  pausedDays?: number;
  pauseAlert?: boolean;
  createdAt: string;
}

interface City {
  id: number;
  name: string;
  regionId: number | null;
  isActive: boolean;
}

interface Region {
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
  ownerKind: 'property'|'service'|'both'|'none';
  propertyCount: number;
  serviceCount: number;
  propertyCategories: Array<{name:string;count:number}>;
  serviceCategories: Array<{name:string;count:number}>;
  propertyLocations: Array<{region:string;city:string;district:string}>;
  serviceLocations: Array<{region:string;city:string;district:string}>;
  primaryProperty: string;
  primaryService: string;
  primaryPropertyId: number | null;
  primaryServiceId: number | null;
  messageCount: number;
  hasMessages: boolean;
  whatsappNumber: string;
  region: string;
  location: string;
  district: string;
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

interface PublishedService {
  id: number;
  submissionId: number;
  businessName: string;
  category: string;
  categoryLabel: string | null;
  descriptionAr: string | null;
  city: string;
  whatsappNumber: string;
  pricingUnit: string | null;
  isActive: boolean;
  createdAt: string;
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
}

interface GlobalSeason {
  id: number;
  nameAr: string;
  startDate: string;
  endDate: string;
  color: string;
  isActive: boolean;
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
                   صباحي
                </th>
                <th style={{ padding: "10px 10px", textAlign: "center", fontSize: 12, color: "#3730a3", fontWeight: 700, borderBottom: "1px solid #334155" }}>
                   مسائي
                </th>
                <th style={{ padding: "10px 10px", textAlign: "center", fontSize: 12, color: "#065f46", fontWeight: 700, borderBottom: "1px solid #334155" }}>
                  ️ يوم كامل
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
                      {label}{isWeekend ? " " : ""}
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
            <span> صباحي: {[s.morningCheckIn && `دخول ${s.morningCheckIn}`, s.morningCheckOut && `خروج ${s.morningCheckOut}`].filter(Boolean).join(" — ")}</span>
          )}
          {(s.eveningCheckIn || s.eveningCheckOut) && (
            <span> مسائي: {[s.eveningCheckIn && `دخول ${s.eveningCheckIn}`, s.eveningCheckOut && `خروج ${s.eveningCheckOut}`].filter(Boolean).join(" — ")}</span>
          )}
          {(s.fullDayCheckIn || s.fullDayCheckOut) && (
            <span>️ يوم كامل: {[s.fullDayCheckIn && `دخول ${s.fullDayCheckIn}`, s.fullDayCheckOut && `خروج ${s.fullDayCheckOut}`].filter(Boolean).join(" — ")}</span>
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
  const [catEmoji, setCatEmoji] = useState("");
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
                       إضافة الفئة وقبولها
                    </Button>
                    <Button size="sm" onClick={() => setShowCatReassign(true)}
                      className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex-1">
                       إعادة التعيين لفئة موجودة
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
                  {s.status === "approved" ? "مقبول بالفعل " : "قبول الطلب"}
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
                placeholder=""
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
function SubmissionsTab() {
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);

  const { data: submissions = [], isLoading, isError, refetch } = useQuery<Submission[]>({
    queryKey: ["admin", "submissions", "pending"],
    queryFn: async () => {
      const r = await apiFetch("/admin/submissions?status=pending");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 30_000,
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

  const heading = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-white">طلبات العقارات الجديدة</h2>
        <p className="mt-1 text-sm text-slate-400">العقارات التي تنتظر مراجعة الإدارة</p>
      </div>
      <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300">
        الطلبات المعلقة: {isLoading || isError ? "—" : toAr(submissions.length)}
      </span>
    </div>
  );

  if (isLoading) {
    return <>{heading}<div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div></>;
  }
  if (isError) {
    return <>{heading}<div className="rounded-lg border border-red-800/50 bg-red-950/20 p-8 text-center text-red-300">
      تعذّر تحميل الطلبات. <Button variant="outline" onClick={() => refetch()} className="mr-2 border-slate-600 text-slate-200">إعادة المحاولة</Button>
    </div></>;
  }

  return (
    <>
      {heading}
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
                <TableCell colSpan={8} className="text-center text-slate-400 py-12">لا توجد طلبات عقارات معلقة حالياً</TableCell>
              </TableRow>
            )}
            {submissions.map((s) => (
              <TableRow key={s.id} className="border-slate-700 hover:bg-slate-800/50 transition-colors">
                <TableCell className="font-semibold text-white">{s.nameAr}</TableCell>
                <TableCell className="text-slate-300">
                  {s.location}
                  {s.suggestedCityName && <span className="block text-xs font-semibold text-amber-400">مدينة مقترحة: {s.suggestedCityName}</span>}
                  {s.region && <span className="block text-xs text-slate-500">{s.region}</span>}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                      onClick={() => setReviewSubmission(s)}
                      title="رفض (افتح المراجعة)"
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
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
  const [newRegion, setNewRegion] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newDistrict, setNewDistrict] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [selectedRegionId, setSelectedRegionId] = useState<string>("");
  const { data: regions = [] } = useQuery({
    queryKey: ["admin", "regions"],
    queryFn: async () => {
      const r = await apiFetch("/admin/regions");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

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

  const addRegion = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiFetch("/admin/regions", { method: "POST", body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
      setNewRegion("");
      qc.invalidateQueries({ queryKey: ["admin", "regions"] });
    },
  });

  const addCity = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiFetch("/admin/cities", { method: "POST", body: JSON.stringify({ name, regionId: Number(selectedRegionId) }) });
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

  const toggleStatus = useMutation({
    mutationFn: async ({ type, id, isActive }: { type: "region" | "city"; id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/${type === "region" ? "regions" : "cities"}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("فشل تحديث الحالة");
      return { type };
    },
    onSuccess: ({ type }) => {
      qc.invalidateQueries({ queryKey: ["admin", type === "region" ? "regions" : "cities"] });
    },
  });

  const regionCities = cities.filter((city: City) => city.regionId === Number(selectedRegionId));
  const cityDistricts = districts.filter((d: District) => d.cityId === Number(selectedCityId));
  const selectedRegion = regions.find((region: Region) => region.id === Number(selectedRegionId));
  const selectedCity = cities.find((city: City) => city.id === Number(selectedCityId));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 className="text-white font-bold mb-4 text-lg">المناطق</h3>
        <div className="flex gap-2 mb-4">
          <Input value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder="اسم المنطقة"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400" />
          <Button onClick={() => newRegion.trim() && addRegion.mutate(newRegion.trim())}
            disabled={!newRegion.trim() || addRegion.isPending} className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
            {addRegion.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
          </Button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {regions.map((region: Region) => (
            <div key={region.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700">
              <span className="text-white font-medium">{region.name}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={toggleStatus.isPending}
                onClick={() => toggleStatus.mutate({ type: "region", id: region.id, isActive: !region.isActive })}
                className={region.isActive
                  ? "border-green-700 bg-green-950/60 text-green-300 hover:bg-green-900/70 hover:text-green-200"
                  : "border-red-800 bg-red-950/50 text-red-300 hover:bg-red-900/60 hover:text-red-200"}
              >
                {region.isActive ? "مفعّلة" : "مقفلة"}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Cities */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 className="text-white font-bold mb-4 text-lg">المدن</h3>
        <div className={`mb-4 rounded-lg border px-4 py-3 text-center ${selectedRegion ? "border-amber-500/60 bg-amber-500/10" : "border-slate-700 bg-slate-900"}`}>
          <p className="text-xs text-slate-400 mb-1">المنطقة التي تدير مدنها الآن</p>
          <p className={`font-extrabold text-lg ${selectedRegion ? "text-white" : "text-slate-500"}`}>
            {selectedRegion ? `إدارة مدن: ${selectedRegion.name}` : "لم يتم اختيار منطقة"}
          </p>
        </div>
        <Select value={selectedRegionId} onValueChange={(value) => { setSelectedRegionId(value); setSelectedCityId(""); }}>
          <SelectTrigger className="bg-slate-900 border-slate-600 text-white mb-2"><SelectValue placeholder="اختر المنطقة" /></SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {regions.map((region: Region) => (
              <SelectItem key={region.id} value={String(region.id)} className="text-white focus:bg-slate-700 focus:text-white">
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            disabled={!newCity.trim() || !selectedRegionId || addCity.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {addCity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
          </Button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {regionCities.map((city: City) => (
            <div key={city.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700">
              <span className="text-white font-medium">{city.name}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggleStatus.isPending}
                  onClick={() => toggleStatus.mutate({ type: "city", id: city.id, isActive: !city.isActive })}
                  className={city.isActive
                    ? "h-8 border-green-700 bg-green-950/60 text-green-300 hover:bg-green-900/70 hover:text-green-200"
                    : "h-8 border-red-800 bg-red-950/50 text-red-300 hover:bg-red-900/60 hover:text-red-200"}
                >
                  {city.isActive ? "مفعّلة" : "مقفلة"}
                </Button>
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
          {selectedRegionId && regionCities.length === 0 && <p className="text-slate-500 text-center py-4">لا توجد مدن بعد</p>}
        </div>
      </div>

      {/* Districts */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 className="text-white font-bold mb-4 text-lg">الأحياء</h3>
        <div className={`mb-4 rounded-lg border px-4 py-3 text-center ${selectedRegion ? "border-amber-500/60 bg-amber-500/10" : "border-slate-700 bg-slate-900"}`}>
          <p className="text-xs text-slate-400 mb-1">المنطقة التي تدير أحياءها الآن</p>
          <p className={`font-extrabold text-lg ${selectedCity ? "text-white" : "text-slate-500"}`}>
            {selectedCity ? `إدارة أحياء: ${selectedCity.name}` : "لم يتم اختيار مدينة"}
          </p>
          {selectedRegion && <p className="mt-1 text-sm font-semibold text-amber-300">المنطقة: {selectedRegion.name}</p>}
        </div>
        <div className="space-y-2 mb-4">
          <Select value={selectedCityId} onValueChange={setSelectedCityId}>
            <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
              <SelectValue placeholder="اختر المدينة" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {regionCities.map((city: City) => (
                <SelectItem key={city.id} value={String(city.id)} className="text-white focus:bg-slate-700 focus:text-white">
                  {city.name}
                </SelectItem>
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

/* ── Independent Service Locations Tab ────────────────────────────── */
function ServiceLocationsTab() {
  const qc = useQueryClient();
  const [newRegion, setNewRegion] = useState("");
  const [newCity, setNewCity] = useState("");
  const [regionId, setRegionId] = useState("");
  const query = (path: string, key: string) => useQuery({
    queryKey: ["admin", "service", key],
    queryFn: async () => { const r = await apiFetch(path); if (!r.ok) throw new Error("فشل التحميل"); return r.json(); },
  });
  const { data: regions = [] } = query("/admin/service-regions", "regions");
  const { data: cities = [] } = query("/admin/service-cities", "cities");
  const mutate = (path: string, body?: unknown, method = "POST") => useMutation({
    mutationFn: async () => { const r = await apiFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }); if (!r.ok) throw new Error("فشلت العملية"); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service"] }); },
  });
  const addRegion = mutate("/admin/service-regions", { name: newRegion.trim() });
  const addCity = mutate("/admin/service-cities", { name: newCity.trim(), regionId: Number(regionId) });
  const toggle = useMutation({
    mutationFn: async ({ type, id, isActive }: { type: "region" | "city"; id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/service-${type === "region" ? "regions" : "cities"}/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error("فشل تحديث الحالة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "service"] }),
  });
  const selectedRegion = regions.find((r: Region) => r.id === Number(regionId));
  const regionCities = cities.filter((c: City) => c.regionId === Number(regionId));
  const statusButton = (type: "region" | "city", item: Region | City) => (
    <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate({ type, id: item.id, isActive: !item.isActive })}
      className={item.isActive ? "h-8 border-green-700 bg-green-950/60 text-green-300" : "h-8 border-red-800 bg-red-950/50 text-red-300"}>
      {item.isActive ? "مفعّلة" : "مقفلة"}
    </Button>
  );
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
      <h3 className="text-white font-bold mb-4 text-lg">مناطق الخدمات</h3>
      <div className="flex gap-2 mb-4"><Input value={newRegion} onChange={e => setNewRegion(e.target.value)} placeholder="اسم المنطقة" className="bg-slate-900 border-slate-600 text-white" />
        <Button onClick={() => { if (newRegion.trim()) { addRegion.mutate(); setNewRegion(""); } }} disabled={!newRegion.trim() || addRegion.isPending} className="bg-amber-600 text-white">إضافة</Button></div>
      <div className="space-y-2 max-h-96 overflow-y-auto">{regions.map((r: Region) => <div key={r.id} className="flex justify-between items-center p-3 rounded-lg bg-slate-900 border border-slate-700"><span className="text-white font-medium">{r.name}</span>{statusButton("region", r)}</div>)}</div>
    </div>
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
      <h3 className="text-white font-bold mb-4 text-lg">مدن الخدمات</h3>
      <div className="mb-4 rounded-lg border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-center"><p className="text-xs text-slate-400">المنطقة المحددة</p><p className="font-extrabold text-lg text-white">{selectedRegion?.name ?? "لم يتم اختيار منطقة"}</p></div>
      <Select value={regionId} onValueChange={setRegionId}><SelectTrigger className="bg-slate-900 border-slate-600 text-white mb-2"><SelectValue placeholder="اختر المنطقة" /></SelectTrigger><SelectContent className="bg-slate-900 border-slate-700">{regions.map((r: Region) => <SelectItem key={r.id} value={String(r.id)} className="text-white">{r.name}</SelectItem>)}</SelectContent></Select>
      <div className="flex gap-2 mb-4"><Input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="اسم المدينة" className="bg-slate-900 border-slate-600 text-white" /><Button onClick={() => { if (newCity.trim()) { addCity.mutate(); setNewCity(""); } }} disabled={!newCity.trim() || !regionId || addCity.isPending} className="bg-amber-600 text-white">إضافة</Button></div>
      <div className="space-y-2 max-h-96 overflow-y-auto">{regionCities.map((c: City) => <div key={c.id} className="flex justify-between items-center p-3 rounded-lg bg-slate-900 border border-slate-700"><span className="text-white">{c.name}</span>{statusButton("city", c)}</div>)}</div>
    </div>
  </div>;
}

/* ── Amenities Tab ────────────────────────────── */
function AmenitiesTab() {
  const qc = useQueryClient();
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
        body: JSON.stringify({ key: `amenity_${crypto.randomUUID()}`, labelAr: newLabel.trim() }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
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
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="الاسم بالعربية (مثل: واي فاي)"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
          />
          <Button
            onClick={() => addAmenity.mutate()}
            disabled={!newLabel.trim() || addAmenity.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {addAmenity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
          </Button>
        </div>
        {addAmenity.isError && <p className="mt-2 text-sm text-red-400">تعذّرت إضافة المرفق. حاول مرة أخرى.</p>}
      </div>

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="text-slate-300 text-right">الاسم بالعربية</TableHead>
              <TableHead className="text-slate-300 text-right">الحالة</TableHead>
              <TableHead className="text-slate-300 text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {amenities.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-slate-400 py-12">لا توجد مرافق بعد</TableCell>
              </TableRow>
            )}
            {amenities.map((a: Amenity) => (
              <TableRow key={a.id} className="border-slate-700 hover:bg-slate-800/50">
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
function normaliseOwnerCategory(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
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
            ️ سيتم حذف <span className="font-bold text-white">{target.name}</span> بشكل ناعم — يُخفى من كل الواجهات مع الاحتفاظ بالبيانات للتقارير والعقود.
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
  const [mainTab, setMainTab]             = useState<"property" | "service" | "both">("property");
  const [search, setSearch]               = useState("");
  const [regionFilter, setRegionFilter]   = useState("");
  const [cityFilter, setCityFilter]       = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [propertyCatFilter, setPropertyCatFilter] = useState("all");
  const [serviceCatFilter, setServiceCatFilter]   = useState("all");
  const [messageFilter, setMessageFilter] = useState<"all" | "with" | "without">("all");
  const [page, setPage]                   = useState(1);
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [archiveOwner, setArchiveOwner]   = useState<{ id: string; name: string } | null>(null);
  const [deleteOwnerTarget, setDeleteOwnerTarget] = useState<{ id: string; name: string } | null>(null);
  const [grantOwner, setGrantOwner] = useState<{ id: string; name: string } | null>(null);
  const [grantPlan, setGrantPlan] = useState("");
  const [grantDays, setGrantDays] = useState("30");
  const [grantReason, setGrantReason] = useState("");
  const [grantError, setGrantError] = useState<string | null>(null);
  const { toast } = useToast();
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

  const { data: grantPlans = [] } = useQuery<Plan[]>({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const r = await adminFetch("/plans");
      if (!r.ok) throw new Error("فشل تحميل الخطط");
      return r.json();
    },
    enabled: isSuperAdmin && grantOwner !== null,
  });

  const grantSubscription = useMutation({
    mutationFn: async () => {
      if (!grantOwner) throw new Error("اختر حساباً أولاً");
      const r = await adminFetch(`/owners/${encodeURIComponent(grantOwner.id)}/subscription-grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: grantPlan,
          days: Number(fromAr(grantDays)),
          reason: grantReason.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "تعذّر تمديد الاشتراك");
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "owners"] });
      setGrantOwner(null);
      setGrantPlan("");
      setGrantDays("30");
      setGrantReason("");
      setGrantError(null);
      toast({ title: "تم تحديث الاشتراك", description: "ستظهر العقارات والخدمات المفعّلة تلقائياً؛ تبقى المعطّلة يدوياً كما هي." });
    },
    onError: (error: Error) => setGrantError(error.message),
  });

  /* ── Fetch catalogs ── */
  const { data: regionsCatalog = [] } = useQuery<Region[]>({
    queryKey: ["admin", "regions"],
    queryFn: async () => {
      const r = await apiFetch("/admin/regions");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: citiesCatalog = [] } = useQuery<City[]>({
    queryKey: ["admin", "cities"],
    queryFn: async () => {
      const r = await apiFetch("/admin/cities");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: allDistricts = [] } = useQuery<District[]>({
    queryKey: ["admin", "districts"],
    queryFn: async () => {
      const r = await apiFetch("/admin/districts");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: serviceRegionsCatalog = [] } = useQuery<Region[]>({
    queryKey: ["service-regions"],
    queryFn: async () => {
      const r = await apiFetch("/service-regions");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: serviceCitiesCatalog = [] } = useQuery<City[]>({
    queryKey: ["service-cities"],
    queryFn: async () => {
      const r = await apiFetch("/service-cities");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: propertiesCats = [] } = useQuery<{id:number;nameAr:string;isActive:boolean}[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/categories");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: serviceCats = [] } = useQuery<{id:number;key:string;labelAr:string;isActive:boolean}[]>({
    queryKey: ["admin", "service-categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/service-categories");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const serviceCategoryLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const category of serviceCats) {
      labels.set(category.key, category.labelAr);
      labels.set(category.labelAr, category.labelAr);
    }
    return labels;
  }, [serviceCats]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [mainTab, search, regionFilter, cityFilter, districtFilter, propertyCatFilter, serviceCatFilter, messageFilter]);

  useEffect(() => {
    setRegionFilter("");
    setCityFilter("");
    setDistrictFilter("");
  }, [mainTab]);

  useEffect(() => {
    setCityFilter("");
    setDistrictFilter("");
  }, [regionFilter]);

  useEffect(() => { setDistrictFilter(""); }, [cityFilter]);

  const activeRegions = mainTab === "service" ? serviceRegionsCatalog : regionsCatalog;
  const activeCities = mainTab === "service" ? serviceCitiesCatalog : citiesCatalog;

  const availableCities = useMemo(() => {
    if (!regionFilter) return [];
    const region = activeRegions.find((r) => r.name === regionFilter);
    if (!region) return [];
    return activeCities.filter((c) => c.regionId === region.id);
  }, [regionFilter, activeRegions, activeCities]);

  const availableDistricts = useMemo(() => {
    if (mainTab === "service" || !cityFilter) return [];
    const city = activeCities.find((c) => c.name === cityFilter);
    if (!city) return [];
    return allDistricts.filter((d) => d.cityId === city.id);
  }, [mainTab, cityFilter, activeCities, allDistricts]);

  // Base list by main tab
  const baseOwners = useMemo(() => {
    return owners.filter(o => {
      if (o.ownerKind === 'none') return false;
      if (mainTab === 'property') return o.ownerKind === 'property';
      if (mainTab === 'service') return o.ownerKind === 'service';
      return o.ownerKind === 'both' && o.propertyCount > 0 && o.serviceCount > 0;
    }).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [owners, mainTab]);

  const dynamicPropertyCats = useMemo(() => {
    return propertiesCats.map(cat => {
      const categoryKey = normaliseOwnerCategory(cat.nameAr);
      const count = baseOwners.filter(o => o.propertyCategories?.some(c => normaliseOwnerCategory(c.name) === categoryKey)).length;
      return { ...cat, count };
    });
  }, [propertiesCats, baseOwners]);

  const dynamicServiceCats = useMemo(() => {
    return serviceCats.map(cat => {
      const count = baseOwners.filter(o => o.serviceCategories?.some(c => c.name === cat.key || c.name === cat.labelAr)).length;
      return { ...cat, count };
    });
  }, [serviceCats, baseOwners]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseOwners.filter(o => {
      if (q && !o.ownerName.toLowerCase().includes(q) && !o.whatsappNumber.includes(q)) return false;
      const locations = mainTab === "service" ? o.serviceLocations : o.propertyLocations;
      if (regionFilter && !locations.some((location) => location.region === regionFilter)) return false;
      if (cityFilter && !locations.some((location) =>
        location.city === cityFilter && (!regionFilter || location.region === regionFilter)
      )) return false;
      if (districtFilter && !locations.some((location) =>
        location.district === districtFilter &&
        (!cityFilter || location.city === cityFilter) &&
        (!regionFilter || location.region === regionFilter)
      )) return false;

      if (mainTab === 'property' && propertyCatFilter !== 'all') {
        const categoryKey = normaliseOwnerCategory(propertyCatFilter);
        if (!o.propertyCategories?.some(c => normaliseOwnerCategory(c.name) === categoryKey)) return false;
      }
      if (mainTab === 'service' && serviceCatFilter !== 'all') {
        if (!o.serviceCategories?.some(c => c.name === serviceCatFilter || c.name === serviceCats.find(sc => sc.key === serviceCatFilter)?.labelAr)) return false;
      }
      if (messageFilter === "with" && !o.hasMessages) return false;
      if (messageFilter === "without" && o.hasMessages) return false;
      return true;
    });
  }, [baseOwners, search, regionFilter, cityFilter, districtFilter, mainTab, propertyCatFilter, serviceCatFilter, serviceCats, messageFilter]);

  const pageSize = 15;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allSelectedOnPage = paginated.length > 0 && paginated.every((o) => selected.has(o.ownerId));
  const hasFilters  = search || regionFilter || cityFilter || districtFilter || messageFilter !== "all" || (mainTab === 'property' && propertyCatFilter !== 'all') || (mainTab === 'service' && serviceCatFilter !== 'all');

  const toggleAllOnPage = () => {
    const newSel = new Set(selected);
    if (allSelectedOnPage) {
      paginated.forEach((o) => newSel.delete(o.ownerId));
    } else {
      paginated.forEach((o) => newSel.add(o.ownerId));
    }
    setSelected(newSel);
  };
  const toggleOne = (id: string) => {
    const newSel = new Set(selected);
    if (newSel.has(id)) newSel.delete(id);
    else newSel.add(id);
    setSelected(newSel);
  };

  const softDeleteOwner = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const r = await apiFetch(`/admin/owners/${id}/soft-delete`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "فشل الحذف");
      }
    },
    onSuccess: () => {
      toast({ title: "تم الحذف", description: "تم حذف المالك وأرشفة بياناته بنجاح" });
      setDeleteOwnerTarget(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "owners"] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  const colSpan = 6;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">إدارة الملاك</h2>
          <p className="text-slate-400 text-sm mt-1">
            {owners.length > 0 ? `${toAr(owners.length)} مالك إجمالي` : "لا يوجد ملاك بعد"}
            {selected.size > 0 && <span className="mr-2 text-amber-400">— {toAr(selected.size)} محدّد</span>}
          </p>
        </div>
        {isSuperAdmin && (
          <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-full font-semibold">
            مشرف عام فقط
          </span>
        )}
      </div>

      {/* ── Main Tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setMainTab("property")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors border-b-2 ${
            mainTab === "property"
              ? "text-amber-400 border-amber-400 bg-amber-500/5"
              : "text-slate-400 border-transparent hover:text-white"
          }`}
        >
          ملاك العقارات
          <span className="mr-1.5 text-xs bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
            {toAr(owners.filter(o => o.ownerKind === 'property').length)}
          </span>
        </button>
        <button
          onClick={() => setMainTab("service")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors border-b-2 ${
            mainTab === "service"
              ? "text-amber-400 border-amber-400 bg-amber-500/5"
              : "text-slate-400 border-transparent hover:text-white"
          }`}
        >
          ملاك الخدمات
          <span className="mr-1.5 text-xs bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
            {toAr(owners.filter(o => o.ownerKind === 'service').length)}
          </span>
        </button>
        <button
          onClick={() => setMainTab("both")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors border-b-2 ${
            mainTab === "both"
              ? "text-amber-400 border-amber-400 bg-amber-500/5"
              : "text-slate-400 border-transparent hover:text-white"
          }`}
        >
          ملاك مشتركون
          <span className="mr-1.5 text-xs bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
            {toAr(owners.filter(o => o.ownerKind === 'both' && o.propertyCount > 0 && o.serviceCount > 0).length)}
          </span>
        </button>
      </div>

      {/* ── Sub-categories (Dynamic) ── */}
      {mainTab === "property" && dynamicPropertyCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPropertyCatFilter("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
              propertyCatFilter === "all"
                ? "bg-slate-700 text-white border-slate-500"
                : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
            }`}
          >
            كل العقارات
          </button>
          {dynamicPropertyCats.map(cat => (
            <button
              key={cat.id}
              onClick={() => setPropertyCatFilter(cat.nameAr)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                propertyCatFilter === cat.nameAr
                  ? "bg-slate-700 text-white border-slate-500"
                  : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {cat.nameAr}
              <span className="mr-1 text-[10px] opacity-60">({toAr(cat.count)})</span>
            </button>
          ))}
        </div>
      )}

      {mainTab === "service" && dynamicServiceCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setServiceCatFilter("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
              serviceCatFilter === "all"
                ? "bg-slate-700 text-white border-slate-500"
                : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
            }`}
          >
            كل الخدمات
          </button>
          {dynamicServiceCats.map(cat => (
            <button
              key={cat.id}
              onClick={() => setServiceCatFilter(cat.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                serviceCatFilter === cat.key
                  ? "bg-slate-700 text-white border-slate-500"
                  : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {cat.labelAr}
              <span className="mr-1 text-[10px] opacity-60">({toAr(cat.count)})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700">
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
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500/60"
        >
          <option value="">كل المناطق</option>
          {activeRegions.map((region) => (
            <option key={region.id} value={region.name}>{region.name}</option>
          ))}
        </select>
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          disabled={!regionFilter || availableCities.length === 0}
          className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">
            {!regionFilter ? "اختر المنطقة أولاً" : availableCities.length === 0 ? "لا توجد مدن" : "كل المدن"}
          </option>
          {availableCities.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        {mainTab !== "service" && (
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
        )}
        <select
          value={messageFilter}
          onChange={(e) => setMessageFilter(e.target.value as "all" | "with" | "without")}
          className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500/60"
        >
          <option value="all">جميع الملاك</option>
          <option value="with">لديهم مراسلات</option>
          <option value="without">ليس لديهم مراسلات</option>
        </select>
      </div>

      {/* Active filter summary */}
      {hasFilters && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>الفلاتر النشطة:</span>
          {mainTab === 'property' && propertyCatFilter !== 'all' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{propertyCatFilter}</span>}
          {mainTab === 'service' && serviceCatFilter !== 'all' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{serviceCats.find(c => c.key === serviceCatFilter)?.labelAr || serviceCatFilter}</span>}
          {regionFilter && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{regionFilter}</span>}
          {cityFilter && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{cityFilter}</span>}
          {districtFilter && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{districtFilter}</span>}
          {messageFilter !== "all" && (
            <span className="bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-full">
              {messageFilter === "with" ? "لديهم مراسلات" : "ليس لديهم مراسلات"}
            </span>
          )}
          {search && <span className="bg-slate-700 px-2 py-0.5 rounded-full">"{search}"</span>}
          <button
            onClick={() => { setSearch(""); setRegionFilter(""); setCityFilter(""); setDistrictFilter(""); setPropertyCatFilter("all"); setServiceCatFilter("all"); setMessageFilter("all"); }}
            className="mr-auto text-slate-500 hover:text-white transition-colors"
          >
            مسح الكل
          </button>
        </div>
      )}

      {/* Results count & Pagination controls top */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          عرض <span className="text-white font-semibold">{toAr(paginated.length)}</span> من <span className="text-white font-semibold">{toAr(filtered.length)}</span> نتائج
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            >
              السابق
            </Button>
            <span className="text-slate-400 text-xs">
              صفحة {toAr(page)} من {toAr(totalPages)}
            </span>
            <Button
              variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            >
              التالي
            </Button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="w-10 text-center">
                <input type="checkbox" checked={allSelectedOnPage} onChange={toggleAllOnPage}
                  className="w-4 h-4 rounded accent-amber-400 cursor-pointer" />
              </TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">اسم المالك</TableHead>
              {mainTab === 'property' && <TableHead className="text-slate-300 text-right font-semibold">العقارات ({toAr(baseOwners.reduce((s,o)=>s+o.propertyCount,0))})</TableHead>}
              {mainTab === 'service' && <TableHead className="text-slate-300 text-right font-semibold">الخدمات ({toAr(baseOwners.reduce((s,o)=>s+o.serviceCount,0))})</TableHead>}
              {mainTab === 'both' && <TableHead className="text-slate-300 text-right font-semibold">النشاط (عقار + خدمة)</TableHead>}
              <TableHead className="text-slate-300 text-right font-semibold">الجوال / واتساب</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">التسجيل / الاشتراك</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-14">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                    <p>{owners.length === 0 ? "لا يوجد ملاك مسجلون بعد" : "لا توجد نتائج تطابق الفلاتر"}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {paginated.map((owner) => (
              <TableRow
                key={owner.ownerId}
                className={`border-slate-700 transition-colors ${selected.has(owner.ownerId) ? "bg-amber-500/5" : "hover:bg-slate-800/50"}`}
              >
                <TableCell className="text-center">
                  <input type="checkbox" checked={selected.has(owner.ownerId)} onChange={() => toggleOne(owner.ownerId)}
                    className="w-4 h-4 rounded accent-amber-400 cursor-pointer" />
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white font-medium text-sm">{owner.ownerName}</span>
                    <span className="font-mono text-[10px] text-slate-500 max-w-[160px] truncate cursor-default" title={owner.ownerId}>
                      {owner.ownerId}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  {mainTab === 'property' && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-200 text-sm font-semibold">{toAr(owner.propertyCount)} عقار</span>
                        <span className="text-slate-400 text-xs truncate max-w-[150px]">{owner.primaryProperty || "—"}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {owner.propertyCategories.map((c, i) => (
                          <span key={i} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {c.name} {c.count > 1 ? `(${toAr(c.count)})` : ""}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {mainTab === 'service' && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-200 text-sm font-semibold">{toAr(owner.serviceCount)} خدمة</span>
                        <span className="text-slate-400 text-xs truncate max-w-[150px]">{owner.primaryService || "—"}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {owner.serviceCategories.map((c, i) => (
                          <span key={i} className="text-[10px] bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {serviceCategoryLabels.get(c.name) ?? c.name} {c.count > 1 ? `(${toAr(c.count)})` : ""}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {mainTab === 'both' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200 text-xs bg-slate-700 px-1.5 py-0.5 rounded">{toAr(owner.propertyCount)} عقار</span>
                        <span className="text-slate-400 text-[10px] truncate max-w-[120px]">{owner.primaryProperty}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-200 text-xs bg-indigo-900/40 border border-indigo-700/50 px-1.5 py-0.5 rounded">{toAr(owner.serviceCount)} خدمة</span>
                        <span className="text-slate-400 text-[10px] truncate max-w-[120px]">{owner.primaryService}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1.5">
                    {owner.region && <span className="text-slate-500 text-[10px]">{owner.region}</span>}
                    {owner.region && owner.location && <span className="text-slate-600 text-[10px]">←</span>}
                    {owner.location && <span className="text-slate-500 text-[10px]">{owner.location}</span>}
                    {owner.location && owner.district && <span className="text-slate-600 text-[10px]">←</span>}
                    {owner.district && <span className="text-slate-500 text-[10px]">{owner.district}</span>}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-slate-300 font-mono text-sm ltr text-right">{toAr(owner.whatsappNumber)}</span>
                    <a href={`https://wa.me/${owner.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 w-fit bg-green-500/10 px-1.5 py-0.5 rounded">
                      مراسلة واتساب
                    </a>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400 text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                      منذ {fmtDate(owner.createdAt)}
                    </span>
                    <span className="text-slate-400 text-xs flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        owner.subscriptionStatus === "active" ? "bg-green-500" :
                        owner.subscriptionStatus === "trial" ? "bg-amber-500" : "bg-red-500"
                      }`}></span>
                      {owner.subscriptionStatus === "active" ? "اشتراك نشط" :
                       owner.subscriptionStatus === "trial" ? "فترة تجريبية" :
                       owner.subscriptionStatus === "expired" ? "منتهي" : "غير محدد"}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {isSuperAdmin && (
                      <Button
                        data-testid={`button-grant-subscription-${owner.ownerId}`}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setGrantOwner({ id: owner.ownerId, name: owner.ownerName });
                          setGrantPlan("");
                          setGrantDays("30");
                          setGrantReason("");
                          setGrantError(null);
                        }}
                        className="h-8 border-amber-700 text-amber-300 hover:bg-amber-900/20"
                      >
                        <Calendar className="ml-1 h-4 w-4" />
                        تمديد الاشتراك
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setArchiveOwner({ id: owner.ownerId, name: owner.ownerName })}
                      className={`relative h-8 text-xs hover:bg-slate-700 ${owner.hasMessages ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-amber-400"}`}
                      title={owner.hasMessages ? `أرشيف المراسلات والدعم — ${owner.messageCount} مراسلات` : "أرشيف المراسلات والدعم"}>
                      <Inbox className="w-4 h-4" />
                      {owner.hasMessages && (
                        <span className="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold leading-4 text-center ring-2 ring-slate-900">
                          {owner.messageCount > 99 ? "+٩٩" : toAr(owner.messageCount)}
                        </span>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteOwnerTarget({ id: owner.ownerId, name: owner.ownerName })}
                      className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20" title="حذف الأرشفة">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {(owner.primaryPropertyId || owner.primaryServiceId) && (
                      <Button asChild variant="ghost" size="sm"
                        className="h-8 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        title={owner.primaryPropertyId ? "معاينة العقار كما يراه العملاء" : "عرض تفاصيل الخدمة كما يراها العملاء"}>
                        <a
                          href={owner.primaryPropertyId
                            ? `${BASE}/chalets/${owner.primaryPropertyId}`
                            : `${BASE}/services/${owner.primaryServiceId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="mr-1">
                            {owner.primaryPropertyId ? "معاينة العقار" : "عرض التفاصيل"}
                          </span>
                        </a>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm pt-2">
          <Button
            variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          >
            السابق
          </Button>
          <span className="text-slate-400 text-xs px-2">
            صفحة {toAr(page)} من {toAr(totalPages)}
          </span>
          <Button
            variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
          >
            التالي
          </Button>
        </div>
      )}

      {deleteOwnerTarget && (
        <DeleteSafeModal
          target={deleteOwnerTarget}
          entityLabel="المالك"
          isLoading={softDeleteOwner.isPending}
          onClose={() => setDeleteOwnerTarget(null)}
          onConfirm={(reason: string) => softDeleteOwner.mutate({ id: deleteOwnerTarget.id, reason })}
        />
      )}

      {archiveOwner && (
        <Dialog open={true} onOpenChange={() => setArchiveOwner(null)}>
          <DialogContent className="max-w-4xl bg-slate-900 border-slate-700 h-[85vh] flex flex-col p-0 overflow-y-auto" dir="rtl">
            <DialogHeader className="p-4 border-b border-slate-800">
              <DialogTitle className="flex items-center gap-2 text-slate-100">
                <Inbox className="w-5 h-5 text-amber-400" />
                أرشيف المراسلات — {archiveOwner.name}
              </DialogTitle>
            </DialogHeader>
            <div className="p-4 flex-1">
              <OwnerInboxTab ownerIdFilter={archiveOwner.id} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isSuperAdmin && grantOwner && (
        <Dialog open={true} onOpenChange={(open) => { if (!open && !grantSubscription.isPending) setGrantOwner(null); }}>
          <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-white" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-400" />
                تمديد اشتراك {grantOwner.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400">الباقة</label>
                <Select value={grantPlan} onValueChange={setGrantPlan}>
                  <SelectTrigger data-testid="select-grant-plan" className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="اختر باقة" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {grantPlans.map((plan) => (
                      <SelectItem key={plan.slug} value={plan.slug}>{plan.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">مدة التمديد بالأيام</label>
                <Input
                  data-testid="input-grant-days"
                  type="text"
                  inputMode="numeric"
                  value={toAr(grantDays)}
                  onChange={(event) => setGrantDays(fromAr(event.target.value))}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">سبب المنح أو التمديد</label>
                <Textarea
                  data-testid="input-grant-reason"
                  value={grantReason}
                  onChange={(event) => setGrantReason(event.target.value)}
                  placeholder="اكتب سبب التمديد الاستثنائي"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <p className="rounded-lg bg-amber-900/20 p-3 text-xs text-amber-200">
                لا يعيد هذا الإجراء تفعيل العقارات أو الخدمات التي عُطّلت عند انتهاء الاشتراك؛ يجب إعادة تفعيلها يدوياً.
              </p>
              {grantError && <p className="text-sm text-red-400" role="alert">{grantError}</p>}
              <div className="flex gap-2">
                <Button
                  data-testid="button-confirm-grant"
                  onClick={() => grantSubscription.mutate()}
                  disabled={grantSubscription.isPending || !grantPlan || Number(fromAr(grantDays)) < 1 || grantReason.trim().length < 5}
                  className="flex-1 bg-amber-600 text-white hover:bg-amber-700"
                >
                  {grantSubscription.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  تأكيد التمديد
                </Button>
                <Button
                  data-testid="button-cancel-grant"
                  variant="outline"
                  onClick={() => setGrantOwner(null)}
                  disabled={grantSubscription.isPending}
                  className="border-slate-600 text-slate-300"
                >
                  إلغاء
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ── Services Tab ─────────────────────────────── */
const SERVICE_CATEGORIES = [
  { value: "bounce_houses",       label: "نطيطات",      emoji: "" },
  { value: "ice_cream",           label: "آيس كريم",    emoji: "" },
  { value: "productive_families", label: "أسر منتجة",  emoji: "" },
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

function LegacyServicesTab() {
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

function ServicesTab() {
  const { data: services = [], isLoading } = useQuery<PublishedService[]>({
    queryKey: ["admin", "published-service-providers"],
    queryFn: async () => {
      const response = await apiFetch("/admin/service-providers");
      if (!response.ok) throw new Error("فشل تحميل الخدمات المنشورة");
      return response.json();
    },
  });

  const pricingUnitLabel = (unit: string | null) => {
    if (unit === "per_day") return "باليوم";
    if (unit === "per_hour") return "بالساعة";
    if (unit === "per_request") return "بالطلب";
    return "حسب الاتفاق";
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-300">
          تعرض هذه القائمة الخدمات المقبولة والمفعلة والمنشورة تلقائياً.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          عند قبول طلب مزود خدمة جديد سيظهر هنا مباشرة دون إضافته يدوياً.
        </p>
      </div>

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="text-slate-300 text-right">الخدمة</TableHead>
              <TableHead className="text-slate-300 text-right">الفئة</TableHead>
              <TableHead className="text-slate-300 text-right">المدينة</TableHead>
              <TableHead className="text-slate-300 text-right">التسعير</TableHead>
              <TableHead className="text-slate-300 text-right">الحالة</TableHead>
              <TableHead className="text-slate-300 text-right">التواصل</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400 py-12">
                  لا توجد خدمات مقبولة ومفعلة حالياً
                </TableCell>
              </TableRow>
            ) : services.map((service) => (
              <TableRow key={service.id} className="border-slate-700 hover:bg-slate-800/50">
                <TableCell>
                  <div className="font-semibold text-white">{service.businessName}</div>
                  {service.descriptionAr && (
                    <div className="text-slate-400 text-xs mt-0.5 line-clamp-1">{service.descriptionAr}</div>
                  )}
                </TableCell>
                <TableCell className="text-slate-300">{service.categoryLabel ?? service.category}</TableCell>
                <TableCell className="text-slate-300">{service.city}</TableCell>
                <TableCell className="text-slate-300">{pricingUnitLabel(service.pricingUnit)}</TableCell>
                <TableCell>
                  <span className="inline-flex rounded-full bg-green-900/50 px-2.5 py-1 text-xs font-semibold text-green-400">
                    منشورة
                  </span>
                </TableCell>
                <TableCell>
                  <a
                    href={`https://wa.me/${service.whatsappNumber.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-slate-300 hover:text-green-400 transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    <span className="text-xs">واتساب</span>
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ── Categories Tab ───────────────────────────── */
function CategoriesTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
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
    onSuccess: () => { setNewName(""); setNewEmoji(""); qc.invalidateQueries({ queryKey: ["admin", "categories"] }); },
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
            placeholder=""
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
                      defaultValue={cat.emoji || ""}
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
                      {cat.showSectionFilter ? " مفعّل" : "معطّل"}
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

  const [newForm, setNewForm] = useState({ key: "", labelAr: "", emoji: "" });
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
          emoji: newForm.emoji.trim() || "",
          sortOrder: items.length,
        }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
      return r.json();
    },
    onSuccess: () => {
      setNewForm({ key: "", labelAr: "", emoji: "" });
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
            {savingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : " حفظ الترتيب"}
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
              placeholder=""
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
                  ️ جميع مزودي الخدمة المسجلين ضمن هذه الفئة سيُنقلون تلقائياً إلى فئة <strong>«أخرى»</strong>.
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



/* ── Chalets Verification Tab ─────────────────── */
function ChaletsVerifyTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"active" | "pending" | "paused" | "deleted">("active");
  const [detailsChaletId, setDetailsChaletId] = useState<number | null>(null);
  const [deleteChaletTarget, setDeleteChaletTarget] = useState<{ id: number; name: string } | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);
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

  const { data: submissions = [] } = useQuery<Submission[]>({
    queryKey: ["admin", "submissions"],
    queryFn: async () => {
      const r = await apiFetch("/admin/submissions");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const submissionById = useMemo(
    () => new Map(submissions.map((submission) => [submission.id, submission])),
    [submissions],
  );
  const selectedChalet = chalets.find((chalet) => chalet.id === detailsChaletId) ?? null;
  const detailsChalet = selectedChalet && selectedChalet.id < 0 && selectedChalet.submissionId
    ? { ...selectedChalet, ...submissionById.get(selectedChalet.submissionId), id: selectedChalet.id, isVerified: selectedChalet.isVerified, adminStatus: selectedChalet.adminStatus }
    : selectedChalet;

  const updateSubmissionStatus = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      const r = await apiFetch(`/admin/submissions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote }),
      });
      if (!r.ok) throw new Error("فشل تحديث حالة العقار");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
      qc.invalidateQueries({ queryKey: ["admin", "chalets"] });
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
      <ChaletDetailsModal key={detailsChalet?.id ?? "closed"} chalet={detailsChalet} onClose={() => setDetailsChaletId(null)} />
      <SubmissionReviewModal
        submission={reviewSubmission}
        open={reviewSubmission !== null}
        onClose={() => setReviewSubmission(null)}
        onDecision={(id, status, adminNote) => updateSubmissionStatus.mutate({ id, status, adminNote })}
        isPending={updateSubmissionStatus.isPending}
      />

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
            مسح الفلاتر
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
              <TableHead className="text-slate-300 text-center font-semibold">التفاصيل</TableHead>
              <TableHead className="text-slate-300 text-center font-semibold">توثيق</TableHead>
              <TableHead className="text-slate-300 text-center font-semibold">حذف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredChalets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-400 py-12">لا توجد شاليهات ضمن هذا التصنيف</TableCell>
              </TableRow>
            ) : filteredChalets.map((c) => {
              const adminStatus = c.adminStatus ?? "active";
              return (
              <TableRow
                key={c.id}
                className="border-slate-700 hover:bg-slate-800/50 transition-colors"
              >
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-amber-500/40 px-2 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
                    onClick={() => setDetailsChaletId(c.id)}
                  >
                    <Eye className="w-4 h-4" />
                    عرض التفاصيل
                  </Button>
                  {adminStatus === "pending" && c.submissionId && submissionById.has(c.submissionId) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-blue-400 hover:text-blue-300"
                      onClick={() => setReviewSubmission(submissionById.get(c.submissionId!) ?? null)}
                    >
                      مراجعة الطلب
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {c.id > 0 ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleVerify.mutate({ id: c.id, isVerified: !c.isVerified });
                      }}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteChaletTarget({ id: c.id, name: c.nameAr });
                      }}
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
  bounce_houses: " نطيطات",
  ice_cream: " آيس كريم",
  productive_families: " أسر منتجة",
  catering: "️ تموين وضيافة",
  photography: " تصوير",
  decoration: " ديكور وتزيين",
  entertainment: " ترفيه وأناشيد",
  other: " أخرى",
};

const PROVIDER_PRICING_UNIT_LABELS: Record<string, string> = {
  per_day: "لكل يوم",
  per_hour: "لكل ساعة",
  per_request: "لكل طلب / لكل حجز",
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
  videoUrl?: string | null;
  yearsOfExperience?: number | null;
  pricingUnit?: string | null;
  dailyCapacity?: number | null;
  requiresInsurance?: boolean;
  insuranceAmount?: string | null;
  requiresContract?: boolean;
  contractText?: string | null;
  coverageTags?: string[];
  customFeatureTags?: string[];
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
      const normalizedNote = note?.trim();
      if ((status === "rejected" || status === "needs_revision") && !normalizedNote) {
        throw new Error("يجب كتابة سبب الرفض أو طلب التعديل");
      }
      const r = await fetch(`${API}/admin/service-submissions/${sub!.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: normalizedNote }),
        credentials: "include",
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error || "فشل التحديث");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "provider-submissions"] });
      qc.invalidateQueries({ queryKey: ["admin", "published-service-providers"] });
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">سنوات الخبرة</p>
              <p className="font-semibold text-foreground">
                {sub.yearsOfExperience != null ? `${toAr(sub.yearsOfExperience)} سنة` : "—"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">الطاقة اليومية</p>
              <p className="font-semibold text-foreground">
                {sub.dailyCapacity != null ? toAr(sub.dailyCapacity) : "—"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">وحدة التسعير</p>
              <p className="font-semibold text-foreground">
                {sub.pricingUnit ? (PROVIDER_PRICING_UNIT_LABELS[sub.pricingUnit] ?? "غير محدد") : "—"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">التأمين</p>
              <p className="font-semibold text-foreground">
                {sub.requiresInsurance ? `${toAr(Number(sub.insuranceAmount ?? 0))} ر.س` : "غير مطلوب"}
              </p>
            </div>
          </div>
          {(sub.coverageTags?.length || sub.customFeatureTags?.length) ? (
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-2">نطاق الخدمة والمميزات</p>
              <div className="flex flex-wrap gap-1.5">
                {[...(sub.coverageTags ?? []), ...(sub.customFeatureTags ?? [])].map((tag, index) => (
                  <span key={`${tag}-${index}`} className="rounded-full bg-amber-500/10 text-amber-600 px-2.5 py-1 text-xs font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {sub.requiresContract && sub.contractText && (
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs mb-1">نص العقد</p>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{sub.contractText}</p>
            </div>
          )}
          {sub.videoUrl && (
            <a
              href={sub.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-amber-500 hover:underline font-semibold"
            >
              <Play className="w-4 h-4" />
              عرض فيديو الخدمة
            </a>
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
          <label className="text-sm font-semibold text-foreground">
            ملاحظة للمزود (تُرسل عند الرفض/التعديل)
            {step !== "view" && <span className="text-red-500"> *</span>}
          </label>
          <Textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="اكتب سبب الرفض أو التعديلات المطلوبة..."
            rows={3}
            required={step !== "view"}
            aria-required={step !== "view"}
            className={`resize-none ${step !== "view" && !adminNote.trim() ? "border-red-500 focus-visible:ring-red-500" : ""}`}
          />
          {step !== "view" && !adminNote.trim() && (
            <p className="text-xs font-medium text-red-500">كتابة السبب إلزامية لإتمام هذا الإجراء.</p>
          )}
          {decide.isError && (
            <p className="text-xs font-medium text-red-500">
              {decide.error instanceof Error ? decide.error.message : "تعذّر تحديث الطلب"}
            </p>
          )}
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
              <Button onClick={() => decide.mutate({ status: "rejected", note: adminNote })}
                disabled={decide.isPending || !adminNote.trim()} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold">
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
              <Button onClick={() => decide.mutate({ status: "needs_revision", note: adminNote })}
                disabled={decide.isPending || !adminNote.trim()} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold">
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

  const quickDecision = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "rejected" }) => {
      const r = await apiFetch(`/admin/service-submissions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error || "فشل تحديث الطلب");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "provider-submissions"] });
      qc.invalidateQueries({ queryKey: ["admin", "published-service-providers"] });
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

      {quickDecision.isError && (
        <div className="rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {quickDecision.error instanceof Error ? quickDecision.error.message : "تعذّر تحديث الطلب، حاول مرة أخرى"}
        </div>
      )}

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
                    {PROVIDER_CATEGORY_LABELS[sub.category]?.split(" ")[0] ?? ""}
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
                    <div className="flex items-center gap-2">
                      {sub.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => quickDecision.mutate({ id: sub.id, status: "approved" })}
                            disabled={quickDecision.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7"
                          >
                            <CheckCircle className="w-3.5 h-3.5 me-1" />
                            قبول
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (window.confirm(`هل تريد رفض طلب "${sub.businessName}"؟`)) {
                                quickDecision.mutate({ id: sub.id, status: "rejected" });
                              }
                            }}
                            disabled={quickDecision.isPending}
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs h-7"
                          >
                            <XCircle className="w-3.5 h-3.5 me-1" />
                            رفض
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(sub)}
                        className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs h-7"
                      >
                        <Eye className="w-3.5 h-3.5 me-1" />
                        عرض التفاصيل
                      </Button>
                    </div>
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
  const [newForm, setNewForm] = useState({ name: "", emoji: "", color: "slate", isOther: false });
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
    onSuccess: () => { setNewForm({ name: "", emoji: "", color: "slate", isOther: false }); invalidate(); },
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
  scope: "property" | "full" | null;
  chaletLimit: number | null;
  serviceLimit: number | null;
  extraChaletPrice: string | null;
  extraServicePrice: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface PlanForm {
  nameAr: string;
  price: string;
  durationDays: number;
  trialDays: number;
  features: string[];
  scope: "property" | "full" | "";
  chaletLimit: number | null;
  serviceLimit: number | null;
  extraChaletPrice: string;
  extraServicePrice: string;
  isActive: boolean;
  sortOrder: number;
}

const BLANK_PLAN = {
  nameAr: "",
  price: "",
  durationDays: 30,
  trialDays: 0,
  features: [] as string[],
  scope: "" as const,
  chaletLimit: 1 as number | null,
  serviceLimit: 0 as number | null,
  extraChaletPrice: "",
  extraServicePrice: "",
  isActive: true,
  sortOrder: 0,
};

const PLAN_DURATION_OPTIONS = [
  { label: "شهر", days: 30 },
  { label: "٣ أشهر", days: 90 },
  { label: "٦ أشهر", days: 180 },
  { label: "سنة", days: 365 },
];

async function adminFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}/admin${path}`, { credentials: "include", ...opts });
}

interface PromoCode {
  id: number;
  code: string;
  kind: "percent" | "fixed";
  value: string;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
}

function PromoCodesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: codes = [], isLoading } = useQuery<PromoCode[]>({
    queryKey: ["admin", "subscription-promo-codes"],
    queryFn: async () => {
      const response = await adminFetch("/promo-codes");
      if (!response.ok) throw new Error("تعذّر تحميل رموز الخصم");
      return response.json();
    },
  });

  function resetForm() {
    setEditing(null);
    setCode("");
    setKind("percent");
    setValue("");
    setUsageLimit("");
    setExpiresAt("");
    setError(null);
  }

  function editPromo(promo: PromoCode) {
    setEditing(promo.id);
    setCode(promo.code);
    setKind(promo.kind);
    setValue(String(Number(promo.value)));
    setUsageLimit(promo.usageLimit == null ? "" : String(promo.usageLimit));
    setExpiresAt(promo.expiresAt
      ? new Date(new Date(promo.expiresAt).getTime() - new Date(promo.expiresAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
      : "");
    setError(null);
  }

  async function savePromo() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        code: code.trim().toUpperCase(),
        kind,
        value: Number(fromAr(value)),
        usageLimit: usageLimit === "" ? null : Number(fromAr(usageLimit)),
        expiresAt: expiresAt || null,
      };
      const response = await adminFetch(
        editing === null ? "/promo-codes" : `/promo-codes/${editing}`,
        {
          method: editing === null ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "تعذّر حفظ رمز الخصم");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["admin", "subscription-promo-codes"] });
      resetForm();
    } catch {
      setError("تعذّر حفظ رمز الخصم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePromo(promo: PromoCode) {
    const response = await adminFetch(`/promo-codes/${promo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !promo.isActive }),
    });
    if (response.ok) await qc.invalidateQueries({ queryKey: ["admin", "subscription-promo-codes"] });
    else setError((await response.json()).error ?? "تعذّر تحديث الرمز");
  }

  async function deletePromo(promo: PromoCode) {
    const action = promo.usedCount > 0 ? "تعطيل" : "حذف";
    if (!confirm(`هل تريد ${action} رمز الخصم ${promo.code}؟`)) return;
    const response = await adminFetch(`/promo-codes/${promo.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "تعذّر إزالة الرمز");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["admin", "subscription-promo-codes"] });
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-800/60 p-5" dir="rtl">
      <div className="mb-4 flex items-center gap-2">
        <Tag className="h-5 w-5 text-amber-400" />
        <div>
          <h3 className="font-bold text-white">رموز الخصم</h3>
          <p className="text-xs text-slate-400">تُطبّق الرموز على الاشتراك عند إتمام الدفع.</p>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">رمز الخصم</label>
          <Input
            data-testid="input-promo-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="مثال: WELCOME20"
            dir="ltr"
            className="bg-slate-900 border-slate-600 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">نوع الخصم</label>
          <Select value={kind} onValueChange={(v) => setKind(v as "percent" | "fixed")}>
            <SelectTrigger data-testid="select-promo-kind" className="bg-slate-900 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="percent">نسبة مئوية</SelectItem>
              <SelectItem value="fixed">مبلغ ثابت (ر.س)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">قيمة الخصم{kind === "percent" ? " (%)" : " (ر.س)"}</label>
          <Input
            data-testid="input-promo-value"
            type="text"
            inputMode="decimal"
            value={toAr(value)}
            onChange={(event) => setValue(fromAr(event.target.value))}
            placeholder={kind === "percent" ? "٢٠" : "٢٠"}
            className="bg-slate-900 border-slate-600 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">الحد الأقصى للاستخدام (اختياري)</label>
          <Input
            data-testid="input-promo-limit"
            type="text"
            inputMode="numeric"
            value={toAr(usageLimit)}
            onChange={(event) => setUsageLimit(fromAr(event.target.value))}
            placeholder="بلا حد"
            className="bg-slate-900 border-slate-600 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">تاريخ الانتهاء (اختياري)</label>
          <Input
            data-testid="input-promo-expiry"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="bg-slate-900 border-slate-600 text-white"
          />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400" role="alert">{error}</p>}
      <div className="mb-5 flex gap-2">
        <Button
          data-testid="button-save-promo"
          onClick={savePromo}
          disabled={saving || !code.trim() || !value || Number(fromAr(value)) <= 0}
          className="bg-amber-600 text-white hover:bg-amber-700"
        >
          {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
          {editing === null ? "إضافة رمز" : "حفظ التعديل"}
        </Button>
        {editing !== null && (
          <Button data-testid="button-cancel-promo-edit" variant="outline" onClick={resetForm} className="border-slate-600 text-slate-300">
            إلغاء التعديل
          </Button>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
      ) : codes.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد رموز خصم بعد.</p>
      ) : (
        <div className="space-y-2">
          {codes.map((promo) => (
            <div key={promo.id} data-testid={`row-promo-code-${promo.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
              <div className="min-w-0">
                <span className="font-mono font-bold text-white" dir="ltr">{promo.code}</span>
                <span className="mr-2 text-sm text-amber-300">
                  {promo.kind === "percent" ? `${toAr(Number(promo.value))}٪` : `${toAr(Number(promo.value))} ر.س`}
                </span>
                <p className="mt-1 text-xs text-slate-400">
                  استُخدم {toAr(promo.usedCount)} مرة
                  {promo.usageLimit != null ? ` من ${toAr(promo.usageLimit)}` : ""}
                  {promo.expiresAt ? ` · ينتهي ${fmtDate(promo.expiresAt)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${promo.isActive ? "text-green-400" : "text-slate-500"}`}>
                  {promo.isActive ? "مفعّل" : "معطّل"}
                </span>
                <Button data-testid={`button-edit-promo-${promo.id}`} variant="ghost" size="sm" onClick={() => editPromo(promo)} className="text-slate-300 hover:text-white">
                  <Edit2 className="h-4 w-4" />
                  <span className="mr-1">تعديل</span>
                </Button>
                <Button data-testid={`button-toggle-promo-${promo.id}`} variant="ghost" size="sm" onClick={() => togglePromo(promo)} className="text-amber-300 hover:bg-amber-900/20">
                  {promo.isActive ? "تعطيل" : "تفعيل"}
                </Button>
                <Button data-testid={`button-delete-promo-${promo.id}`} variant="ghost" size="sm" onClick={() => deletePromo(promo)} className="text-red-400 hover:bg-red-900/20">
                  {promo.usedCount > 0 ? "تعطيل الرمز" : "حذف"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlansTab({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>({ ...BLANK_PLAN });
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
      nameAr: p.nameAr,
      price: String(Number(p.price)),
      durationDays: p.durationDays,
      trialDays: p.trialDays,
      features: p.features ?? [],
      scope: p.scope ?? "",
      chaletLimit: p.chaletLimit,
      serviceLimit: p.serviceLimit,
      extraChaletPrice: p.extraChaletPrice ?? "",
      extraServicePrice: p.extraServicePrice ?? "",
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
        scope: form.scope || undefined,
        chaletLimit: form.chaletLimit,
        serviceLimit: form.serviceLimit,
        extraChaletPrice: form.extraChaletPrice === "" ? null : Number(fromAr(form.extraChaletPrice)),
        extraServicePrice: form.extraServicePrice === "" ? null : Number(fromAr(form.extraServicePrice)),
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
    } catch {
      setError("تعذّر حفظ الخطة. حاول مرة أخرى.");
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
  const approximateMonths = Math.round(form.durationDays / 30);
  const monthsLabel = approximateMonths === 1
    ? "شهر واحد"
    : approximateMonths === 2
      ? "شهرين"
      : approximateMonths <= 10
        ? `${toAr(approximateMonths)} أشهر`
        : `${toAr(approximateMonths)} شهراً`;

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
                  {p.scope && (
                    <span className="text-slate-300">
                      {p.scope === "property" ? "إدارة العقار فقط" : "العقار مع النظام المالي والإداري"}
                    </span>
                  )}
                  {p.chaletLimit != null && (
                    <span className="text-slate-400">العقارات: {p.chaletLimit === 0 ? "غير متاح" : toAr(p.chaletLimit)}</span>
                  )}
                  {p.serviceLimit != null && (
                    <span className="text-slate-400">الخدمات: {p.serviceLimit === 0 ? "غير متاح" : toAr(p.serviceLimit)}</span>
                  )}
                  {(p.extraChaletPrice == null || p.extraServicePrice == null) && (
                    <span className="text-amber-300">رسوم الإضافات غير مكتملة</span>
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

      {isSuperAdmin && <PromoCodesPanel />}

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
            <div>
              <label className="text-xs text-slate-400 mb-1 block">اسم الخطة *</label>
              <Input
                placeholder="مثال: الخطة الذهبية"
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">نوع الباقة *</label>
                <Select
                  value={form.scope || "unset"}
                  onValueChange={(value) => setForm({
                    ...form,
                    scope: value === "unset" ? "" : value as "property" | "full",
                  })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="اختر نوع الباقة" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="unset">اختر نوع الباقة</SelectItem>
                    <SelectItem value="property">إدارة العقار فقط</SelectItem>
                    <SelectItem value="full">إدارة العقار مع النظام المالي والإداري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-400">
                الحد الفارغ يعني بلا حد؛ القيمة صفر تعني عدم إتاحة هذا النوع من الأصول.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">عدد العقارات ضمن الباقة</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="بلا حد"
                    value={form.chaletLimit == null ? "" : toAr(String(form.chaletLimit))}
                    onChange={(e) => {
                      const value = fromAr(e.target.value);
                      setForm({ ...form, chaletLimit: value === "" ? null : Number(value) });
                    }}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">عدد الخدمات ضمن الباقة</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="بلا حد"
                    value={form.serviceLimit == null ? "" : toAr(String(form.serviceLimit))}
                    onChange={(e) => {
                      const value = fromAr(e.target.value);
                      setForm({ ...form, serviceLimit: value === "" ? null : Number(value) });
                    }}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">رسوم العقار الإضافي (ر.س)</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="غير محدد"
                    value={toAr(form.extraChaletPrice)}
                    onChange={(e) => setForm({ ...form, extraChaletPrice: fromAr(e.target.value) })}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">رسوم الخدمة الإضافية (ر.س)</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="غير محدد"
                    value={toAr(form.extraServicePrice)}
                    onChange={(e) => setForm({ ...form, extraServicePrice: fromAr(e.target.value) })}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
              </div>
              <p className="text-xs text-amber-300">
                يجب تحديد رسوم الإضافات قبل بيعها؛ الحقول الفارغة تعني أنها غير مفعّلة للتحصيل.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <p className="text-xs text-slate-400" aria-live="polite">
              {form.durationDays >= 30
                ? `المدة تعادل نحو ${monthsLabel} (على أساس ٣٠ يوماً للشهر)`
                : form.durationDays > 0
                  ? "المدة أقل من شهر (على أساس ٣٠ يوماً للشهر)"
                  : "أدخل مدة لا تقل عن يوم واحد"}
            </p>
            <div className="flex flex-wrap gap-2" aria-label="مدد مقترحة للخطة">
              {PLAN_DURATION_OPTIONS.map(({ label, days }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setForm({ ...form, durationDays: days })}
                  className={`rounded-lg px-3 py-1.5 text-xs border transition-colors ${
                    form.durationDays === days
                      ? "border-amber-500 bg-amber-900/30 text-amber-300"
                      : "border-slate-600 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {label} · {toAr(days)} يوماً
                </button>
              ))}
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
                disabled={saving || !form.nameAr.trim() || !form.price || !form.scope || form.durationDays < 1}
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
  pending_docs:   { label: "في انتظار المستندات", icon: "", className: "bg-orange-900/40 text-orange-300 border border-orange-700/50" },
  docs_submitted: { label: "مستندات مرفوعة",      icon: "", className: "bg-blue-900/40 text-blue-300 border border-blue-700/50" },
  verified:       { label: "موثّق",                icon: "", className: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50" },
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
               تم التحقق من البريد
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


/* ══════════════════════════════════════════════════════════════
   DirectAdd Tab — admin directly creates a chalet or service provider
   under a chosen owner, bypassing the submission review flow.
   ══════════════════════════════════════════════════════════════ */
const DA_PROPERTY_TYPES = [
  { value: "شالية",    label: "️ شالية" },
  { value: "مزرعة",   label: " مزرعة" },
  { value: "استراحة", label: " استراحة" },
  { value: "مخيم",    label: " مخيم" },
];
const DA_SECTIONS_OPTS = [
  { value: "قسم واحد",      label: " قسم واحد" },
  { value: "قسمين منفصلة", label: " قسمين منفصلة" },
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
          ? ` تم تسجيل "${newOwner.fullName}" وتفعيل حسابه مباشرة — يلزم فقط تحقق البريد الإلكتروني`
          : ` تم تسجيل "${newOwner.fullName}" وتفعيل حسابه مباشرة — رقم الجوال هو المعرّف الرئيسي للحساب`);
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
        setSuccess(assetType === "chalet" ? `تم إضافة "${cForm.nameAr}" بنجاح ` : `تم إضافة "${sForm.businessName}" بنجاح `);
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
        <button type="button" onClick={() => { setAssetType("chalet"); resetAll(); }} className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${assetType==="chalet" ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}> عقار</button>
        <button type="button" onClick={() => { setAssetType("service"); resetAll(); }} className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${assetType==="service" ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}> مزود خدمة / فعالية</button>
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
                 تم اختيار: {owners.find(o => o.ownerId === ownerId)?.ownerName ?? ownerId}
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
              <summary className="cursor-pointer text-sm text-amber-400 hover:text-amber-300 select-none"> جدول أسعار الأيام (اختياري)</summary>
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
                  <p className="text-xs text-slate-400 mb-2 font-medium"> الفترة الصباحية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الدخول</label><Input type="time" value={morningCheckIn} onChange={e => setMorningCheckIn(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الخروج</label><Input type="time" value={morningCheckOut} onChange={e => setMorningCheckOut(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                  </div>
                </div>}
                {slotEvening && <div>
                  <p className="text-xs text-slate-400 mb-2 font-medium"> الفترة المسائية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الدخول</label><Input type="time" value={eveningCheckIn} onChange={e => setEveningCheckIn(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                    <div className="space-y-1"><label className="text-xs text-slate-500">وقت الخروج</label><Input type="time" value={eveningCheckOut} onChange={e => setEveningCheckOut(e.target.value)} className="bg-slate-900 border-slate-600 text-white h-8 text-sm" /></div>
                  </div>
                </div>}
                {slotFullDay && <div>
                  <p className="text-xs text-slate-400 mb-2 font-medium">️ اليوم الكامل</p>
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
                  <span className="text-sm text-slate-300 truncate flex-1">تم رفع الفيديو </span>
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
                  <span className="text-sm text-slate-300 truncate flex-1">تم رفع الفيديو </span>
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

يسعدنا انضمامك إلى منصة تكيّة!

تم تفعيل حسابك مباشرة. يمكنك الآن البدء بالخطوات التالية:

1️⃣  أضف شاليهك — أدخل الصور والتفاصيل والموقع
2️⃣  حدّد الأسعار والمواسم — يومي، نهاية أسبوع، مواسم خاصة
3️⃣  استقبل الحجوزات — وتابعها مباشرة من لوحة التحكم

سجّل الدخول واختر نوع نشاطك للبدء بإضافة عقارك أو خدمتك.

فريق تكيّة ️`;

const DEFAULT_WA_OTP_TEMPLATE = `مرحباً {NAME}، رمز التحقق الخاص بك في منصة تكيّة هو: {OTP}
هذا الرمز صالح لمدة ١٠ دقائق فقط.`;


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
  owner_group_id?: string;
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
  const [activeTab, setActiveTab] = useState<"all" | "new" | "in_progress" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);

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

  const newCount = requests.filter((r) => r.status === "new").length;
  const totalCount = requests.length;
  const statusCounts = useMemo(() => ({
    all: requests.length,
    new: requests.filter((request) => request.status === "new").length,
    in_progress: requests.filter((request) => request.status === "in_progress").length,
    resolved: requests.filter((request) => request.status === "resolved").length,
  }), [requests]);

  const uniqueSubjects = useMemo(() => {
    const subs = new Set<string>();
    requests.forEach(r => { if (r.subject) subs.add(r.subject); });
    return Array.from(subs);
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (activeTab !== "all" && req.status !== activeTab) return false;
      if (subjectFilter !== "all" && req.subject !== subjectFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = req.owner_name?.toLowerCase().includes(q) || false;
        const matchId = req.owner_id?.toLowerCase().includes(q) || false;
        const matchSubject = req.subject?.toLowerCase().includes(q) || false;
        if (!matchName && !matchId && !matchSubject) return false;
      }
      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortBy === "newest" ? dateB - dateA : dateA - dateB;
    });
  }, [requests, activeTab, searchQuery, subjectFilter, sortBy]);

  const ownerGroups = useMemo(() => {
    if (ownerIdFilter) return []; // Not used in single owner mode
    const groups: Record<string, {
      owner_id: string;
      owner_name: string;
      requests: typeof requests;
      newCount: number;
      inProgressCount: number;
      resolvedCount: number;
      latestDate: number;
    }> = {};

    filteredRequests.forEach(req => {
      const oid = req.owner_group_id ?? req.owner_id;
      if (!groups[oid]) {
        groups[oid] = {
          owner_id: oid,
          owner_name: req.owner_name || oid,
          requests: [],
          newCount: 0,
          inProgressCount: 0,
          resolvedCount: 0,
          latestDate: 0,
        };
      }
      groups[oid].requests.push(req);
      if (req.status === "new") groups[oid].newCount++;
      if (req.status === "in_progress") groups[oid].inProgressCount++;
      if (req.status === "resolved") groups[oid].resolvedCount++;
      const time = new Date(req.created_at).getTime();
      if (time > groups[oid].latestDate) groups[oid].latestDate = time;
    });

    return Object.values(groups).sort((a, b) => {
      return sortBy === "newest" ? b.latestDate - a.latestDate : a.latestDate - b.latestDate;
    });
  }, [filteredRequests, sortBy, ownerIdFilter]);

  const renderRequestItem = (req: OwnerSupportRequest) => {
    const isExpanded = expandedId === req.id;
    const isReplying = replyingId === req.id;
    const statusInfo = SUPPORT_STATUS_LABELS[req.status] ?? { label: req.status, className: "bg-slate-800 text-slate-400 border border-slate-600" };
    return (
      <div key={req.id} className={`bg-slate-800/80 border rounded-xl overflow-hidden transition-all ${req.status === "new" ? "border-red-700/50" : "border-slate-700"}`}>
        <div
          className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-700/60 transition-colors"
          onClick={() => { setExpandedId(isExpanded ? null : req.id); if (!isExpanded) setReplyingId(null); }}
        >
          {req.status === "new" && <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {ownerIdFilter ? (
                <span className="font-semibold text-slate-100 text-sm truncate">{req.subject}</span>
              ) : (
                <>
                  <span className="text-slate-300 text-sm truncate">{req.subject}</span>
                </>
              )}
              {req.admin_reply && (
                <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-700/30 px-1.5 py-0.5 rounded-full shrink-0">تم الرد</span>
              )}
            </div>
            <p className="text-slate-500 text-xs mt-0.5">{fmtDate(req.created_at)}</p>
          </div>
          <span className={`text-[10px] md:text-xs px-2.5 py-1 rounded-full shrink-0 ${statusInfo.className}`}>{statusInfo.label}</span>
          <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </div>

        {isExpanded && (
          <div className="border-t border-slate-700 bg-slate-900/50 px-4 py-4 space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1.5 font-medium">الرسالة:</p>
              <div className="bg-slate-800/80 rounded-lg p-3 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{req.message}</div>
              {(() => {
                const urls = req.attachment_urls?.length ? req.attachment_urls : req.attachment_url ? [req.attachment_url] : [];
                return urls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {urls.map((url: string, i: number) => url.toLowerCase().includes(".pdf") ? (
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
                      {adminUrls.map((url: string, i: number) => url.toLowerCase().includes(".pdf") ? (
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
  };

  return (
    <div className="space-y-6" dir="rtl">
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
                جديدة: <span className="font-bold">{toAr(newCount)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
        <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-700/50 w-full xl:w-auto overflow-x-auto scrollbar-hide">
          {(["all", "new", "in_progress", "resolved"] as const).map(tab => {
            const labels = { all: "الكل", new: "الجديدة", in_progress: "قيد المعالجة", resolved: "تم الحل" };
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                  isActive
                    ? "bg-slate-700 text-amber-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                }`}
              >
                {labels[tab]}
                {statusCounts[tab] > 0 && (
                  <span className={`inline-flex items-center justify-center text-[10px] min-w-5 h-5 px-1 rounded-full ${
                    tab === "new" ? "bg-red-500 text-white" : isActive ? "bg-amber-500/20 text-amber-300" : "bg-slate-700 text-slate-300"
                  }`}>
                    {toAr(statusCounts[tab])}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex gap-3 w-full xl:w-auto flex-wrap">
          <div className="relative flex-1 xl:w-64 min-w-[200px]">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder={ownerIdFilter ? "بحث في الموضوع..." : "بحث باسم، معرف، أو موضوع..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-3 pr-9 bg-slate-900/50 border-slate-700 text-sm h-10 w-full"
            />
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-700 h-10 text-sm">
              <SelectValue placeholder="تصنيف الموضوع" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
              <SelectItem value="all">كل المواضيع</SelectItem>
              {uniqueSubjects.map(sub => (
                <SelectItem key={sub} value={sub}>{sub}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as "newest" | "oldest")}>
            <SelectTrigger className="w-[120px] bg-slate-900/50 border-slate-700 h-10 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <SelectValue placeholder="فرز" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
              <SelectItem value="newest">الأحدث</SelectItem>
              <SelectItem value="oldest">الأقدم</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/40 rounded-xl border border-slate-700/50">
          <Inbox className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-300 font-medium text-lg">لا توجد رسائل مطابقة</p>
          <p className="text-slate-500 text-sm mt-1">جرب تغيير فلاتر البحث أو التبويب</p>
        </div>
      ) : ownerIdFilter ? (
        <div className="space-y-3">
          {filteredRequests.map(req => renderRequestItem(req))}
        </div>
      ) : (
        <div className="space-y-4">
          {ownerGroups.map(group => (
            <div key={group.owner_id} className={`bg-slate-800/40 border rounded-xl overflow-hidden transition-colors ${expandedOwnerId === group.owner_id ? "border-amber-700/50 bg-slate-800/60" : "border-slate-700"}`}>
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-700/40 transition-colors"
                onClick={() => setExpandedOwnerId(expandedOwnerId === group.owner_id ? null : group.owner_id)}
              >
                <div className="w-10 h-10 rounded-full bg-slate-900/80 flex items-center justify-center shrink-0 border border-slate-700">
                  <Users className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-100 truncate">{group.owner_name}</h3>
                    <span className="text-xs text-slate-500 font-mono hidden sm:inline-block">({group.owner_id})</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Inbox className="w-3.5 h-3.5" />
                      {toAr(group.requests.length)} طلب
                    </span>
                    {group.newCount > 0 && (
                      <span className="text-[10px] text-red-300 flex items-center gap-1.5 bg-red-900/30 px-2 py-0.5 rounded-full border border-red-800/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        {toAr(group.newCount)} جديدة
                      </span>
                    )}
                    {group.inProgressCount > 0 && (
                      <span className="text-[10px] text-amber-300 flex items-center gap-1 bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-800/50">
                        <Clock className="w-3 h-3" />
                        {toAr(group.inProgressCount)} قيد المعالجة
                      </span>
                    )}
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${expandedOwnerId === group.owner_id ? "rotate-180 text-amber-400" : ""}`} />
              </div>

              {expandedOwnerId === group.owner_id && (
                <div className="border-t border-slate-700/50 bg-slate-900/50 p-4 space-y-3">
                  {group.requests.map(req => renderRequestItem(req))}
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
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

type GuideRow = { id: number; sectionKey: string; title: string; videoUrl: string };
type NewEntry = {
  title: string;
  url: string;
  source: "youtube" | "upload";
  fileName: string;
  uploading: boolean;
  saving: boolean;
};

const EMPTY_GUIDE_ENTRY: NewEntry = {
  title: "",
  url: "",
  source: "youtube",
  fileName: "",
  uploading: false,
  saving: false,
};


/* ══════════════════════════════════════════════════════════════
   Contact Inquiries Tab
   ══════════════════════════════════════════════════════════════ */

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

/* ── Centrally managed seasons ───────────────────── */
function GlobalSeasonsTab() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nameAr, setNameAr] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [color, setColor] = useState("#f59e0b");
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const seasonsQuery = useQuery<GlobalSeason[]>({
    queryKey: ["admin", "global-seasons"],
    queryFn: async () => {
      const response = await apiFetch("/admin/global-seasons");
      if (!response.ok) throw new Error("تعذّر تحميل المواسم المركزية");
      return response.json();
    },
  });
  const seasons = seasonsQuery.data ?? [];

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setNameAr("");
    setStartDate("");
    setEndDate("");
    setColor("#f59e0b");
    setFormError("");
  }

  function openEdit(season: GlobalSeason) {
    setEditingId(season.id);
    setNameAr(season.nameAr);
    setStartDate(season.startDate.split("T")[0]);
    setEndDate(season.endDate.split("T")[0]);
    setColor(season.color || "#f59e0b");
    setFormError("");
    setFormOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: number | null; nameAr: string; startDate: string; endDate: string; color: string; isActive: boolean }) => {
      const response = await apiFetch(payload.id ? `/admin/global-seasons/${payload.id}` : "/admin/global-seasons", {
        method: payload.id ? "PUT" : "POST",
        body: JSON.stringify({
          nameAr: payload.nameAr,
          startDate: payload.startDate,
          endDate: payload.endDate,
          color: payload.color,
          isActive: payload.isActive,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "تعذّر حفظ الموسم");
      }
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "global-seasons"] });
      resetForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiFetch(`/admin/global-seasons/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "تعذّر حذف الموسم");
      }
    },
    onSuccess: () => {
      setDeleteError("");
      qc.invalidateQueries({ queryKey: ["admin", "global-seasons"] });
    },
    onError: (error: Error) => setDeleteError(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ season, isActive }: { season: GlobalSeason; isActive: boolean }) => {
      const response = await apiFetch(`/admin/global-seasons/${season.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nameAr: season.nameAr,
          startDate: season.startDate,
          endDate: season.endDate,
          color: season.color,
          isActive,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "تعذّر تحديث حالة الموسم");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "global-seasons"] }),
    onError: (error: Error) => setDeleteError(error.message),
  });

  function submitForm() {
    setFormError("");
    if (!nameAr.trim() || !startDate || !endDate) {
      setFormError("يرجى إدخال اسم الموسم وتاريخ البداية والنهاية");
      return;
    }
    if (endDate < startDate) {
      setFormError("يجب أن يكون تاريخ النهاية بعد تاريخ البداية");
      return;
    }
    const existing = editingId == null ? undefined : seasons.find((season) => season.id === editingId);
    saveMutation.mutate({
      id: editingId,
      nameAr: nameAr.trim(),
      startDate,
      endDate,
      color: color || "#f59e0b",
      isActive: existing?.isActive ?? true,
    });
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-400" />
            المواسم والأعياد
          </h2>
          <p className="text-sm text-slate-400 mt-1">أنشئ مواسم مركزية تظهر للمالكين ويمكن لكل عقار تفعيلها أو تعطيلها.</p>
        </div>
        {!formOpen && (
          <Button onClick={() => { resetForm(); setFormOpen(true); }} className="bg-amber-600 hover:bg-amber-500 text-white gap-2">
            <Plus className="w-4 h-4" /> إضافة موسم
          </Button>
        )}
      </div>

      {formOpen && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
          <h3 className="font-semibold text-white mb-4">{editingId ? "تعديل الموسم" : "إضافة موسم مركزي"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm text-slate-300">اسم الموسم</label>
              <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} placeholder="مثال: إجازة الصيف" className="bg-slate-900 border-slate-600 text-white" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300">تاريخ البداية</label>
              <DualDatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="اختر تاريخ البداية"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300">تاريخ النهاية</label>
              <DualDatePicker
                value={endDate}
                onChange={setEndDate}
                minDate={startDate || undefined}
                placeholder="اختر تاريخ النهاية"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm text-slate-300">لون الموسم</label>
              <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-14 rounded-lg border border-slate-600 bg-slate-900 p-1 cursor-pointer" />
                <Input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#f59e0b" className="max-w-40 bg-slate-900 border-slate-600 text-white" />
              </div>
            </div>
          </div>
          {formError && <p className="text-sm text-red-400 mt-3">{formError}</p>}
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="ghost" onClick={resetForm} className="text-slate-300">إلغاء</Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending} className="bg-amber-600 hover:bg-amber-500 text-white">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ الموسم
            </Button>
          </div>
        </div>
      )}

      {deleteError && <div className="rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{deleteError}</div>}
      {seasonsQuery.isLoading ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 py-14 text-center text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-amber-400" /> جارٍ تحميل المواسم...
        </div>
      ) : seasonsQuery.isError ? (
        <div className="rounded-2xl border border-red-800/60 bg-red-950/20 py-12 text-center">
          <p className="text-red-300 mb-3">{seasonsQuery.error instanceof Error ? seasonsQuery.error.message : "تعذّر تحميل المواسم"}</p>
          <Button variant="outline" onClick={() => seasonsQuery.refetch()} className="border-slate-600 text-slate-200">إعادة المحاولة</Button>
        </div>
      ) : seasons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 py-14 text-center">
          <Calendar className="w-9 h-9 mx-auto mb-3 text-slate-600" />
          <p className="text-slate-300">لا توجد مواسم مركزية بعد</p>
          <p className="text-sm text-slate-500 mt-1">أضف موسمًا ليظهر للمالكين في لوحة التحكم.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map((season) => (
            <div key={season.id} className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 flex items-center gap-4">
              <span className="w-11 h-11 rounded-xl shrink-0 border border-white/10" style={{ backgroundColor: season.color || "#f59e0b" }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{season.nameAr}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {season.startDate.split("T")[0].split("-").reverse().join("/")} ← {season.endDate.split("T")[0].split("-").reverse().join("/")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs ${season.isActive ? "text-emerald-400" : "text-slate-500"}`}>{season.isActive ? "نشط" : "متوقف"}</span>
                <Switch checked={season.isActive} onCheckedChange={(isActive) => toggleMutation.mutate({ season, isActive })} disabled={toggleMutation.isPending} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(season)} className="text-slate-300 hover:text-white"><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => { if (window.confirm("هل تريد حذف هذا الموسم؟")) deleteMutation.mutate(season.id); }} disabled={deleteMutation.isPending} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ALL_TABS = [
  { id: "overview",                label: "الإحصائيات",            icon: BarChart3 },
  { id: "chalets",                 label: "قائمة العقارات",        icon: Home },
  { id: "submissions",             label: "طلبات العقارات الجديدة", icon: ClipboardList },
  { id: "platformRevenue",         label: "ميزانية المنصة",        icon: TrendingUp },
  { id: "services",                label: "قائمة الخدمات",          icon: Wrench },
  { id: "serviceSubmissions",      label: "طلبات الخدمات الجديدة", icon: ClipboardList },
  { id: "globalSeasons",           label: "المواسم والأعياد",       icon: Calendar },
  { id: "serviceCategories",       label: "فئات الخدمات",          icon: Tag },
  { id: "expenseCategories",       label: "فئات المصروفات",        icon: Tag },
  { id: "locations",               label: "المناطق والمدن والأحياء", icon: Building2 },
  { id: "serviceLocations",        label: "المناطق والمدن",         icon: MapPin },
  { id: "amenities",               label: "مرافق وتصنيفات العقارات", icon: Tag },
  { id: "categories",              label: "فئات العقارات",         icon: Tag },
  { id: "owners",                  label: "الملاك",                 icon: Users },
  { id: "plans",                   label: "خطط الاشتراك",          icon: CreditCard },
  { id: "reviews",                 label: "تقييمات العملاء",       icon: Star },
  { id: "ownerInbox",              label: "صندوق الوارد",          icon: Inbox },
  { id: "contactInquiries",        label: "رسائل التواصل",         icon: Mail },
  { id: "waSubscribers",           label: "قائمة المشتركين",       icon: Smartphone },
  { id: "siteSettings",            label: "الإعدادات العامة",      icon: Settings },
  { id: "auditLogs",               label: "سجل العمليات",          icon: FileText },
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
  { id: "properties", label: "إدارة العقارات", icon: Home, tabs: ["chalets", "submissions", "categories", "amenities", "locations"] },
  { id: "services", label: "إدارة الخدمات", icon: Wrench, tabs: ["services", "serviceSubmissions", "serviceCategories", "serviceLocations"] },
  { id: "users", label: "إدارة المستخدمين", icon: Users, tabs: ["owners", "ownerInbox"] },
  { id: "staff", label: "طاقم العمل", icon: Shield, tabs: ["adminStaff"] },
  { id: "operations", label: "العمليات", icon: Calendar, tabs: ["reviews", "waSubscribers", "globalSeasons"] },
  { id: "finance", label: "المالية", icon: DollarSign, tabs: ["platformRevenue", "plans", "expenseCategories"] },
  { id: "settings", label: "الإعدادات", icon: Settings, tabs: ["siteSettings", "contactInquiries", "auditLogs"] },
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

const DEFAULT_REVIEW_TEMPLATE = "أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} \nاضغط هنا لتقييمك: {link}";

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
      const r = await fetch(`${API}/admin/review-chalets`, { credentials: "include" });
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
                        {copiedId === c.id ? " تم النسخ" : "نسخ"}
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
  personalEmail: string | null;
  mobile: string | null;
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
  const [newEmail, setNewEmail] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [newPerms, setNewPerms] = useState<AdminStaffPermissions>(
    () => Object.fromEntries(ALL_ADMIN_PERM_KEYS.map((key) => [key, false])),
  );

  const [editCredName, setEditCredName] = useState("");
  const [editCredUsername, setEditCredUsername] = useState("");
  const [editCredEmail, setEditCredEmail] = useState("");
  const [editCredMobile, setEditCredMobile] = useState("");
  const [editCredPassword, setEditCredPassword] = useState("");
  const [credError, setCredError] = useState("");
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
        body: JSON.stringify({
          name: newName.trim(), username: newUsername.trim(),
          personalEmail: newEmail.trim(), mobile: newMobile.trim(),
          password: newPassword, isActive: newIsActive, permissions: newPerms,
        }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "فشل الحفظ"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      setShowAdd(false);
      setNewName(""); setNewUsername(""); setNewEmail(""); setNewMobile("");
      setNewPassword(""); setNewIsActive(true);
      setNewPerms(Object.fromEntries(ALL_ADMIN_PERM_KEYS.map((key) => [key, false])));
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
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "فشل حفظ الصلاحيات"); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "staff"] }); setPermEditId(null); },
  });

  const credMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const r = await fetch(`${API}/admin/staff/${id}/credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editCredName.trim(), username: editCredUsername.trim(),
          personalEmail: editCredEmail.trim(), mobile: editCredMobile.trim(),
          password: editCredPassword || undefined,
        }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "فشل تحديث بيانات الموظف"); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      setCredEditId(null); setEditCredPassword(""); setCredError("");
    },
    onError: (error: Error) => setCredError(error.message),
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
                placeholder="اسم_المستخدم"
                dir="auto"
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
            <div>
              <label className="block text-sm text-slate-400 mb-1">البريد الإلكتروني الشخصي</label>
              <Input type="email" dir="auto" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                placeholder="أدخل بريدك الإلكتروني الشخصي" className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">رقم الجوال</label>
              <Input type="tel" dir="ltr" value={newMobile} onChange={(e) => setNewMobile(e.target.value)}
                placeholder="٠٥١٢٣٤٥٦٧٨" className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">حالة الحساب</label>
              <div className="flex items-center gap-3 min-h-10">
                <Switch checked={newIsActive} onCheckedChange={setNewIsActive} aria-label="تفعيل حساب الموظف" />
                <span className="text-sm text-slate-200">{newIsActive ? "مفعّل — يمكنه الدخول فوراً" : "معطّل — لا يمكنه الدخول"}</span>
              </div>
              <p className="text-xs text-slate-400">لا يتطلب تفعيل الحساب رمز تحقق خارجي.</p>
            </div>
          </div>

          {/* Permission toggles */}
          <div className="mb-4">
            <p className="text-sm text-slate-400 mb-3">الصلاحيات الممنوحة:</p>
            <p className="text-xs text-amber-300 mb-3">إدارة موظفي الإدارة وسجل العمليات وميزانية المنصة والإضافة المباشرة مخصصة للمشرف العام فقط.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ALL_ADMIN_PERM_KEYS.map((key) => {
                const info = ADMIN_PERM_LABELS[key];
                const enabled = hasAdminPermission(newPerms, key);
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
                      <div className="text-xs text-slate-400">{info.description}</div>
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
              disabled={!newName.trim() || !newUsername.trim() || !newEmail.trim() || !newMobile.trim() || newPassword.length < 8 || addMutation.isPending}
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
            const activePerms = ALL_ADMIN_PERM_KEYS.filter((k) => hasAdminPermission(member.permissions ?? {}, k));
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
                    {(member.personalEmail || member.mobile) && (
                      <p className="text-slate-400 text-xs mt-1" dir="auto">
                        {[member.personalEmail, member.mobile].filter(Boolean).join(" · ")}
                      </p>
                    )}
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
                      onClick={() => {
                        setCredEditId(isCredOpen ? null : member.id); setPermEditId(null);
                        setEditCredName(member.name); setEditCredUsername(member.username);
                        setEditCredEmail(member.personalEmail ?? ""); setEditCredMobile(member.mobile ?? "");
                        setEditCredPassword(""); setCredError("");
                      }}
                      className="text-xs text-slate-400 hover:text-amber-400 px-2 py-1 rounded border border-slate-600 hover:border-amber-600 transition-colors"
                    >
                      تعديل البيانات
                    </button>
                    <button
                      onClick={() => {
                        setPermEditId(isPermOpen ? null : member.id); setCredEditId(null);
                        setEditPerms(Object.fromEntries(ALL_ADMIN_PERM_KEYS.map((key) => [
                          key, hasAdminPermission(member.permissions ?? {}, key),
                        ])));
                      }}
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
                {statusMutation.isError && <p className="text-red-400 text-sm px-4 pb-2">تعذّر تغيير حالة الحساب. حاول مرة أخرى.</p>}

                {/* Credential Editor */}
                {isCredOpen && (
                  <div className="border-t border-slate-700 bg-slate-900/40 p-4">
                    <p className="text-slate-300 text-sm font-medium mb-3">تعديل بيانات الموظف</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">الاسم الكامل</label>
                        <Input value={editCredName} onChange={(e) => setEditCredName(e.target.value)} className="bg-slate-700 border-slate-600 text-white text-sm h-8" />
                      </div>
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
                        <label className="block text-xs text-slate-400 mb-1">البريد الإلكتروني الشخصي</label>
                        <Input type="email" dir="ltr" value={editCredEmail} onChange={(e) => setEditCredEmail(e.target.value)} className="bg-slate-700 border-slate-600 text-white text-sm h-8" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">رقم الجوال</label>
                        <Input type="tel" dir="ltr" value={editCredMobile} onChange={(e) => setEditCredMobile(e.target.value)} className="bg-slate-700 border-slate-600 text-white text-sm h-8" />
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
                    {credError && <p className="text-red-400 text-sm mb-2">{credError}</p>}
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setCredEditId(null)} className="text-slate-400 hover:text-white text-xs h-7">إلغاء</Button>
                      <Button
                        size="sm"
                        onClick={() => credMutation.mutate({ id: member.id })}
                        disabled={!editCredName.trim() || !editCredUsername.trim() || (editCredPassword.length > 0 && editCredPassword.length < 8) || credMutation.isPending}
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
                        const enabled = hasAdminPermission(editPerms, key);
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
                              <div className="text-xs text-slate-400">{info.description}</div>
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
                    {permMutation.isError && <p className="text-red-400 text-sm mb-2">{(permMutation.error as Error).message}</p>}
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
      return hasAdminPermission(adminPerms, permKey as AdminPermKey);
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
          <div className="text-6xl mb-6"></div>
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
          {isSuperAdmin && <button
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
          </button>}
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
        {activeTab === "submissions"          && <SubmissionsTab />}
        {activeTab === "platformRevenue"      && <PlatformRevenueTab />}
        {activeTab === "services"             && <ServicesTab />}
        {activeTab === "serviceSubmissions"   && <ProviderSubmissionsTab />}
        {activeTab === "globalSeasons"        && <GlobalSeasonsTab />}
        {activeTab === "serviceCategories"   && <ServiceCategoriesTab />}
        {activeTab === "expenseCategories"   && <ExpenseCategoriesTab />}
        {activeTab === "locations"           && <LocationsTab />}
        {activeTab === "serviceLocations"    && <ServiceLocationsTab />}
        {activeTab === "amenities"           && <AmenitiesTab />}
        {activeTab === "categories"          && <CategoriesTab />}
        {activeTab === "owners"              && <OwnersTab isSuperAdmin={isSuperAdmin} />}
        {activeTab === "plans"               && <PlansTab isSuperAdmin={isSuperAdmin} />}
        {activeTab === "reviews"             && <ReviewsTab />}
        {activeTab === "ownerInbox"          && <OwnerInboxTab />}
        {activeTab === "contactInquiries"      && <ContactInquiriesTab />}
        {activeTab === "waSubscribers"         && <WaSubscribersTab />}
        {activeTab === "siteSettings"          && <CentralSettingsTab />}
        {activeTab === "auditLogs"             && <AuditLogsTab />}
        {activeTab === "adminStaff"          && <AdminStaffTab isSuperAdmin={isSuperAdmin} currentUserName={displayName ?? ""} />}
        {activeTab === "directAdd"           && <DirectAddTab mode={directAddMode} />}
      </main>
    </div>
  );
}
