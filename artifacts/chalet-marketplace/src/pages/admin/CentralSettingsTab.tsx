import { useState, useEffect, useRef, useMemo } from "react";
import { SectionGuideCatalogView } from "@/components/admin/SectionGuideCatalogView";
import { toast, useToast } from "@/hooks/use-toast";
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
import { Loader2, Trash2, CheckCircle, XCircle, MapPin, Settings, Users, Tag, Building2, Wrench, Plus, Edit2, Phone, Eye, EyeOff, Calendar, ShieldCheck, ShieldOff, Shield, Clock, Zap, Globe, Heart, ExternalLink, Instagram, Twitter, AlertTriangle, RotateCcw, Home, DoorOpen, Star, Image as ImageIcon, ChevronLeft, ChevronRight, ChevronDown, GripVertical, ToggleLeft, ToggleRight, CreditCard, Save, X, Upload, Palette, TrendingUp, DollarSign, BarChart3, FileCheck, FileText, Check, Video, Mail, MessageSquare, Send, Inbox, Smartphone, Download, Paperclip, BookOpen, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChaletDiamondContent } from "@/components/chalet/ChaletDiamondContent";
import { Toggle } from "@radix-ui/react-toggle";
import { match } from "assert";
import { on } from "cluster";
import { title } from "process";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

function apiFetch(path: string, opts?: RequestInit) { 
  return fetch(`${API}${path}`, { 
    credentials: "include", 
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) }, 
    ...opts, 
  }); 
} 

async function persistGeneralSettings(data: Record<string, string>): Promise<Record<string, string>> {
  // Photography status belongs to its dedicated owner-services workflow.
  const editable = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "photography_enabled"));
  const response = await apiFetch("/admin/settings", { method: "PATCH", body: JSON.stringify(editable) });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error(typeof result?.error === "string" ? result.error : "تعذر حفظ الإعدادات. يرجى إعادة المحاولة.");
  }
  if (!result.settings || Object.entries(editable).some(([key, value]) => result.settings[key] !== value)) {
    throw new Error("لم يؤكد الخادم حفظ القيم المطلوبة. يرجى التحقق وإعادة المحاولة.");
  }
  return result.settings;
}

function notifySettingsSaveError(error: Error) {
  toast({ title: "لم يتم تأكيد الحفظ", description: error.message, variant: "destructive" });
}

export const PRESET_COLORS = ["#d97706", "#16a34a", "#2563eb", "#9333ea", "#dc2626", "#0891b2", "#c2410c", "#0f766e"];

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
      setSaved(false);
      const changed = Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== settings?.[key]));
      return persistGeneralSettings(changed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["siteSettings"] });
      qc.invalidateQueries({ queryKey: ["page-content"] });
      setSaved(true);
      toast({ title: "تم الحفظ بنجاح", description: "تم تأكيد حفظ الإعدادات في قاعدة البيانات." });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: notifySettingsSaveError,
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
    { key: "faq_page_content",     label: "محتوى صفحة «أسئلة شائعة»",     icon: "", path: "/faq"      },
    { key: "terms_page_content",   label: "محتوى صفحة «شروط الاستخدام»",  icon: "", path: "/terms"    },
    { key: "privacy_page_content", label: "محتوى صفحة «سياسة الخصوصية»",  icon: "", path: "/privacy"  },
  ];

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>;

  const SaveBtn = ({ label }: { label: string }) => (
    <Button onClick={() => saveSettings.mutate(form)} disabled={saveSettings.isPending} className="bg-amber-600 hover:bg-amber-700 w-full gap-2">
      <Save className="w-4 h-4" />
      {saved ? " تم الحفظ" : saveSettings.isPending ? "جاري الحفظ..." : label}
    </Button>
  );

  return (
    <div className="relative pb-24">
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
          
        </div>
      </div>

      {/* ══ 3.5. WhatsApp Booking Message Template ══ */}
      <div className="bg-slate-800 rounded-xl border border-green-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-green-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <span className="text-[#25D366] text-xl leading-none"></span>
          <h3 className="text-slate-100 font-bold text-lg">قالب رسالة حجز الواتساب</h3>
          <span className="text-xs text-slate-500 mr-auto">تُرسَل عند الضغط على زر «احجز الآن»</span>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">نص القالب</label>
            <Textarea
              value={form.wa_message_template ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, wa_message_template: e.target.value }))}
              placeholder={`السلام عليكم، أريد حجز {chalet_name} عبر منصة شاليهات القصيم \nتفاصيل الحجز:\nاليوم: {day_name}\nالتاريخ الهجري: {hijri_date} هـ\nالتاريخ الميلادي: {gregorian_date} م\nالفترة: {period_name}\nالإجمالي: {total_price}\nهل الحجز متاح؟`}
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
              placeholder="أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} &#10;اضغط هنا لتقييمك: {link}"
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
          
        </div>
      </div>

      {/* ══ 3.7. Service Suggestion Button ══ */}
      <div className="bg-slate-800 rounded-xl border border-amber-500/30 overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <span className="text-xl leading-none">️</span>
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
              placeholder="️ تنسيق خدمات إضافية لمناسبتك (ذبائح، ضيافة...)"
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
                {form.svc_btn_label?.trim() || "️ تنسيق خدمات إضافية لمناسبتك (ذبائح، ضيافة...)"}
              </div>
            </div>
          )}

          
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
            icon={<span className="text-yellow-300 text-base leading-none"></span>} form={form} setForm={setForm} />
          <SocialToggleRow label="تيك توك" urlKey="tiktok_url" showKey="tiktok_show"
            icon={<span className="text-slate-200 text-base leading-none"></span>} form={form} setForm={setForm} />
          
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
          
        </div>
      ))}
    
      </div>
      <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-4 -mx-6 -mb-6 mt-6 rounded-b-2xl z-10 flex justify-end shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
        <div className="w-48">
          <SaveBtn label="حفظ الإعدادات العامة" />
        </div>
      </div>
    </div>
  );
}

/* ── Chalets Verification Tab ─────────────────── */
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
      setSaved(false);
      return persistGeneralSettings({ terms_page_content: text });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["page-content"] });
      setSaved(true);
      toast({ title: "تم الحفظ بنجاح", description: "تم تأكيد حفظ النص في قاعدة البيانات." });
      setTimeout(() => setSaved(false), 3000);
    },
    onError: notifySettingsSaveError,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-slate-400 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="relative pb-24">
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
      <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-4 -mx-6 -mb-6 mt-6 rounded-b-2xl z-10 flex justify-end shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
        <div className="w-48">
          <Button
            onClick={() => saveMutation.mutate(termsText)}
            disabled={saveMutation.isPending}
            className="w-full bg-amber-600 hover:bg-amber-700 gap-2"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</>
            ) : saved ? (
              " تم الحفظ"
            ) : (
              "حفظ الشروط"
            )}
          </Button>
        </div>
      </div>
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

يسعدنا انضمامك إلى منصة تكيّة! 

حسابك الآن قيد المراجعة من فريق الإدارة. بعد التفعيل، يمكنك البدء بالخطوات التالية:

1️⃣  أضف شاليهك — أدخل الصور والتفاصيل والموقع
2️⃣  حدّد الأسعار والمواسم — يومي، نهاية أسبوع، مواسم خاصة
3️⃣  استقبل الحجوزات — وتابعها مباشرة من لوحة التحكم

سنُرسل إليك إشعاراً فور تفعيل حسابك.

فريق تكيّة ️`;

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
      setSaved(null);
      const changed = Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== settings?.[key]));
      return persistGeneralSettings(changed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["siteSettings"] });
      qc.invalidateQueries({ queryKey: ["page-content"] });
      toast({ title: "تم الحفظ بنجاح", description: "تم تأكيد حفظ إعدادات التواصل في قاعدة البيانات." });
    },
    onError: notifySettingsSaveError,
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
    <div className="relative pb-24">
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
              placeholder="مرحباً بك في منصة تكيّة "
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
          
        </div>
      </div>

    
      </div>
      <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-4 -mx-6 -mb-6 mt-6 rounded-b-2xl z-10 flex justify-end shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
        <div className="w-48">
          <Button
            onClick={() => saveMutation.mutate(form, { onSuccess: () => { setSaved('all'); setTimeout(() => setSaved(null), 2500); } })}
            disabled={saveMutation.isPending}
            className="w-full bg-amber-600 hover:bg-amber-700 gap-2"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</>
            ) : saved ? (
              " تم الحفظ"
            ) : (
              "حفظ إعدادات التواصل"
            )}
          </Button>
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

export function SectionGuidesAdminTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: guides = [], isLoading, isError, refetch } = useQuery<GuideRow[]>({
    queryKey: ["admin", "section-guides"],
    queryFn: async () => {
      const r = await apiFetch("/admin/section-guides");
      if (!r.ok) throw new Error("تعذر تحميل شروحات الأقسام");
      return r.json();
    },
  });
  const [newEntries, setNewEntries] = useState<Record<string, NewEntry>>({});
  const [showAdd, setShowAdd]       = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]     = useState<Record<number, boolean>>({});

  function toggleAdd(key: string) {
    setShowAdd(s => ({ ...s, [key]: !s[key] }));
    if (!newEntries[key]) setNewEntries(e => ({ ...e, [key]: { ...EMPTY_GUIDE_ENTRY } }));
  }

  async function addGuide(key: string) {
    const e = newEntries[key];
    if (!e?.title.trim() || !e?.url.trim()) return;
    if (e.source === "youtube" && !getYouTubeEmbedUrl(e.url)) {
      toast({ title: "رابط غير صالح", description: "يرجى إدخال رابط يوتيوب صحيح", variant: "destructive" });
      return;
    }
    setNewEntries(n => ({ ...n, [key]: { ...n[key], saving: true } }));
    try {
      const r = await apiFetch("/admin/section-guides", {
        method: "POST",
        body: JSON.stringify({ sectionKey: key, title: e.title.trim(), videoUrl: e.url.trim() }),
      });
      if (!r.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["admin", "section-guides"] });
      await qc.invalidateQueries({ queryKey: ["section-guides"] });
      setNewEntries(n => ({ ...n, [key]: { ...EMPTY_GUIDE_ENTRY } }));
      setShowAdd(s => ({ ...s, [key]: false }));
      toast({ title: "تمت الإضافة ", description: `تمت إضافة "${e.title.trim()}" بنجاح` });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الحفظ", variant: "destructive" });
      setNewEntries(n => ({ ...n, [key]: { ...n[key], saving: false } }));
    }
  }

  async function uploadGuideVideo(key: string, file: File) {
    if (!file.type.startsWith("video/")) {
      toast({ title: "ملف غير صالح", description: "يرجى اختيار ملف فيديو", variant: "destructive" });
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast({ title: "حجم الفيديو كبير", description: "الحد الأقصى المسموح 200MB", variant: "destructive" });
      return;
    }
    setNewEntries(n => ({
      ...n,
      [key]: { ...n[key], uploading: true, fileName: file.name, url: "" },
    }));
    try {
      const request = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "video/mp4",
        }),
        credentials: "include",
      });
      const uploadData = await request.json();
      if (!request.ok || !uploadData.uploadURL || !uploadData.objectPath) {
        throw new Error(uploadData.error || "تعذّر تجهيز رفع الفيديو");
      }
      const upload = await fetch(uploadData.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!upload.ok) throw new Error("تعذّر رفع الفيديو إلى التخزين");
      const videoUrl = `${BASE}/api/storage${uploadData.objectPath}`;
      setNewEntries(n => ({
        ...n,
        [key]: { ...n[key], uploading: false, url: videoUrl, fileName: file.name },
      }));
      toast({ title: "تم رفع الفيديو ", description: "يمكنك الآن حفظ الشرح" });
    } catch (error: any) {
      setNewEntries(n => ({
        ...n,
        [key]: { ...n[key], uploading: false, url: "", fileName: "" },
      }));
      toast({ title: "تعذّر رفع الفيديو", description: error.message, variant: "destructive" });
    }
  }

  async function deleteGuide(id: number) {
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      const r = await apiFetch(`/admin/section-guides/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["admin", "section-guides"] });
      await qc.invalidateQueries({ queryKey: ["section-guides"] });
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
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-slate-800 p-4 sm:p-5">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-amber-300" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-white">إدارة شروحات الأقسام</h2>
          <p className="mt-2 text-sm sm:text-base leading-7 text-slate-200">
            اختر القسم المناسب، واضغط «إضافة فيديو»، ثم اكتب عنوان الشرح والصق <span className="font-bold text-amber-300">رابط يوتيوب</span> واحفظه.
            يمكنك أيضاً رفع ملف فيديو مباشرةً وإضافة أكثر من شرح للقسم الواحد.
            بعد الحفظ يظهر زر <span className="font-bold text-amber-300">شروحات القسم</span> للمالك داخل القسم نفسه.
          </p>
        </div>
      </div>

      {/* Sections */}
      {isLoading ? <p className="p-6 text-center text-muted-foreground">جارٍ تحميل الشروحات...</p>
        : isError ? <div role="alert" className="rounded-xl border border-destructive/30 p-5 space-y-3">
          <p>تعذر تحميل الشروحات. لم تُحذف الشروحات المحفوظة.</p>
          <button type="button" className="rounded-lg border px-4 py-2" onClick={() => { void refetch(); }}>إعادة المحاولة</button>
        </div>
        : <SectionGuideCatalogView renderSection={({ key, label }) => {
          const sectionGuides = guides.filter(g => g.sectionKey === key);
          const entry = newEntries[key] ?? EMPTY_GUIDE_ENTRY;
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
                    {/* Video source */}
                    <div>
                      <label className="block text-[11px] font-semibold text-foreground mb-1">
                        طريقة إضافة الفيديو
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNewEntries(n => ({ ...n, [key]: { ...n[key], source: "youtube", url: "", fileName: "" } }))}
                          className={`h-10 rounded-lg border text-xs font-bold transition-colors ${entry.source === "youtube" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
                        >
                          رابط يوتيوب
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewEntries(n => ({ ...n, [key]: { ...n[key], source: "upload", url: "", fileName: "" } }))}
                          className={`h-10 rounded-lg border text-xs font-bold transition-colors ${entry.source === "upload" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
                        >
                          رفع ملف فيديو
                        </button>
                      </div>
                    </div>

                    {entry.source === "youtube" ? (
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
                    ) : (
                      <label className={`flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-center transition-colors ${entry.url ? "border-green-500/50 bg-green-500/5 text-green-700 dark:text-green-400" : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-primary/5"}`}>
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          disabled={entry.uploading}
                          onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) void uploadGuideVideo(key, file);
                            event.target.value = "";
                          }}
                        />
                        {entry.uploading ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs font-semibold">جاري رفع ومعالجة الفيديو...</span></>
                        ) : entry.url ? (
                          <><CheckCircle className="h-4 w-4" /><span className="min-w-0 truncate text-xs font-semibold">{entry.fileName} — تم الرفع، اضغط للتغيير</span></>
                        ) : (
                          <><Upload className="h-4 w-4" /><span className="text-xs font-semibold">اختر فيديو كاملاً للرفع (حتى 200MB)</span></>
                        )}
                      </label>
                    )}
                    {/* Save button */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => addGuide(key)}
                        disabled={entry.saving || entry.uploading || !entry.title.trim() || !entry.url.trim()}
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
        }} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Contact Inquiries Tab
   ══════════════════════════════════════════════════════════════ */

export function CentralSettingsTab() {
  const [activeSubTab, setActiveSubTab] = useState<"site" | "communication" | "terms" | "guides">("site");

  const subTabs = [
    { id: "site", label: "إعدادات الموقع", icon: Settings },
    { id: "communication", label: "إعدادات التواصل", icon: Mail },
    { id: "terms", label: "شروط الاستخدام", icon: FileCheck },
    { id: "guides", label: "شروحات الأقسام", icon: BookOpen },
  ] as const;

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto" dir="rtl">
      {/* Sidebar Tabs */}
      <div className="md:w-64 shrink-0 space-y-2">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                isActive
                  ? "bg-amber-500 text-white shadow-md shadow-amber-900/20"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-slate-900/30 border border-slate-700/50 rounded-2xl p-6 relative">
        {activeSubTab === "site" && <SettingsTab />}
        {activeSubTab === "communication" && <CommunicationSettingsTab />}
        {activeSubTab === "terms" && <TermsManagementTab />}
        {activeSubTab === "guides" && <SectionGuidesAdminTab />}
      </div>
    </div>
  );
}
