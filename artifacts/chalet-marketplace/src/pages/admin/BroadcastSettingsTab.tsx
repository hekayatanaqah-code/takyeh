import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Loader2, Mail, MessageCircle, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface EmailSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromAddress: string;
  passwordConfigured: boolean;
  ready: boolean;
  source: string;
}

interface BroadcastSettings {
  email: EmailSettings;
  whatsapp: { ready: false };
}

const emptyEmailSettings: EmailSettings = {
  host: "",
  port: 587,
  secure: false,
  username: "",
  fromAddress: "",
  passwordConfigured: false,
  ready: false,
  source: "",
};

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
}

export function BroadcastSettingsTab({
  onNavigate,
}: {
  onNavigate?: (tab: "broadcast") => void;
}) {
  const [email, setEmail] = useState<EmailSettings>(emptyEmailSettings);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  async function loadSettings() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiFetch("/admin/broadcast/settings");
      if (!response.ok) throw new Error();
      const data = await response.json() as Partial<BroadcastSettings>;
      const incoming = data?.email;
      setEmail({
        host: typeof incoming?.host === "string" ? incoming.host : "",
        port: Number(incoming?.port) || 587,
        secure: incoming?.secure === true,
        username: typeof incoming?.username === "string" ? incoming.username : "",
        fromAddress: typeof incoming?.fromAddress === "string" ? incoming.fromAddress : "",
        passwordConfigured: incoming?.passwordConfigured === true,
        ready: incoming?.ready === true,
        source: typeof incoming?.source === "string" ? incoming.source : "",
      });
    } catch {
      setLoadError("تعذر تحميل إعدادات قنوات الإرسال. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function updateEmail<K extends keyof Pick<EmailSettings, "host" | "port" | "secure" | "username" | "fromAddress">>(
    key: K,
    value: EmailSettings[K],
  ) {
    setEmail((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    setActionMessage("");
    try {
      const payload: {
        host: string;
        port: number;
        secure: boolean;
        username: string;
        fromAddress: string;
        password?: string;
      } = {
        host: email.host.trim(),
        port: Number(email.port),
        secure: email.secure,
        username: email.username.trim(),
        fromAddress: email.fromAddress.trim(),
      };
      if (password.length > 0) payload.password = password;
      const response = await apiFetch("/admin/broadcast/settings/smtp", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      setPassword("");
      setActionMessage("تم حفظ إعدادات SMTP.");
      await loadSettings();
    } catch {
      setActionError("تعذر حفظ إعدادات SMTP. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSettings() {
    setDeleting(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await apiFetch("/admin/broadcast/settings/smtp", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setPassword("");
      setActionMessage("تم حذف إعدادات SMTP.");
      await loadSettings();
    } catch {
      setActionError("تعذر حذف إعدادات SMTP. يرجى المحاولة مرة أخرى.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300"><Mail className="h-5 w-5" /></span>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">إعدادات قنوات الإرسال</h1>
          <p className="text-sm text-slate-400">إدارة اتصال البريد الإلكتروني وإظهار حالة جاهزية القنوات.</p>
        </div>
        {onNavigate && <Button variant="outline" size="sm" onClick={() => onNavigate("broadcast")} className="gap-2">
          <ArrowRight className="h-4 w-4" /> العودة إلى التعميمات
        </Button>}
      </header>

      {loadError && <p role="alert" className="text-sm text-red-300">{loadError}</p>}

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">البريد الإلكتروني — SMTP</h2>
            <p className="mt-1 text-sm text-slate-400">بيانات كلمة المرور لا تُعرض مجدداً. اترك الحقل فارغاً للإبقاء على كلمة المرور المخزنة.</p>
          </div>
          {loading ? (
            <span className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحقق</span>
          ) : email.ready ? (
            <span className="rounded-full border border-emerald-700/50 bg-emerald-900/30 px-3 py-1 text-xs font-semibold text-emerald-300">مهيأ وجاهز</span>
          ) : (
            <span className="rounded-full border border-amber-700/50 bg-amber-900/20 px-3 py-1 text-xs font-semibold text-amber-300">غير جاهز</span>
          )}
        </div>

        {!loading && !email.ready && (
          <p className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 text-sm text-amber-200">
            لم يؤكد الخادم جاهزية SMTP. تحقق من بيانات المضيف والاتصال ومعلومات المصادقة.
          </p>
        )}

        <form onSubmit={(event) => void saveSettings(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-200">
              <span>مضيف SMTP</span>
              <Input value={email.host} onChange={(event) => updateEmail("host", event.target.value)} required disabled={loading || saving} autoComplete="off" className="border-slate-700 bg-slate-950 text-white" />
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span>المنفذ</span>
              <Input type="number" min={1} max={65535} value={email.port} onChange={(event) => updateEmail("port", Number(event.target.value))} required disabled={loading || saving} className="border-slate-700 bg-slate-950 text-white" />
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span>اسم المستخدم</span>
              <Input value={email.username} onChange={(event) => updateEmail("username", event.target.value)} required disabled={loading || saving} autoComplete="username" className="border-slate-700 bg-slate-950 text-white" />
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span>عنوان المرسل</span>
              <Input type="email" value={email.fromAddress} onChange={(event) => updateEmail("fromAddress", event.target.value)} required disabled={loading || saving} autoComplete="off" className="border-slate-700 bg-slate-950 text-white" />
            </label>
            <label className="space-y-2 text-sm text-slate-200 sm:col-span-2">
              <span>كلمة المرور {email.passwordConfigured ? "(مخزنة — اتركها فارغة للإبقاء عليها)" : "(غير مخزنة)"}</span>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading || saving} autoComplete="new-password" className="border-slate-700 bg-slate-950 text-white" />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3">
            <span className="text-sm text-slate-200">اتصال آمن (TLS)</span>
            <Switch checked={email.secure} onCheckedChange={(checked) => updateEmail("secure", checked)} disabled={loading || saving} aria-label="اتصال SMTP آمن" />
          </div>
          {actionError && <p role="alert" className="text-sm text-red-300">{actionError}</p>}
          {actionMessage && <p role="status" className="text-sm text-emerald-300">{actionMessage}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={loading || saving || deleting} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ إعدادات SMTP
            </Button>
            <Button type="button" variant="outline" onClick={() => void deleteSettings()} disabled={loading || saving || deleting || (!email.host && !email.passwordConfigured)} className="gap-2">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} حذف إعدادات SMTP
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-3">
        <div className="flex items-center gap-2 text-white"><MessageCircle className="h-5 w-5 text-emerald-300" /><h2 className="font-bold">واتساب</h2></div>
        <p className="text-sm font-semibold text-amber-300">غير متاح — بانتظار معلومات مزود الخدمة.</p>
        <p className="text-sm text-slate-400">لا تتوفر حالياً معلومات تكامل كافية لتفعيل هذه القناة؛ إضافة مفتاح API وحده لا تعني أن الإرسال جاهز.</p>
      </section>
    </div>
  );
}