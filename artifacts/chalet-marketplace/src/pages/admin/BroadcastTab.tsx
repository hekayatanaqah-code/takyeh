import { useEffect, useState } from "react";
import { Loader2, Send, Megaphone, History, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Audience = "all" | "active" | "providers";
type Channel = "inApp" | "inbox" | "email" | "whatsapp";
type ChannelMap<T> = Record<Channel, T>;

interface Preview {
  total: number;
  byChannel: ChannelMap<number>;
  readiness: ChannelMap<boolean>;
}

interface BroadcastRow {
  id: number | string;
  title: string;
  body: string;
  audience: Audience;
  channels: Channel[];
  createdAt: string;
  counts: Record<string, unknown>;
}

interface Recipient {
  key: string;
  name: string;
  channels: Channel[];
}

const CHANNELS: Array<{ id: Channel; label: string }> = [
  { id: "inApp", label: "إشعارات داخل التطبيق" },
  { id: "inbox", label: "صندوق الوارد" },
  { id: "email", label: "البريد الإلكتروني" },
  { id: "whatsapp", label: "واتساب" },
];
const AUDIENCES: Array<{ id: Audience; label: string }> = [
  { id: "all", label: "جميع الملاك ومقدمي الخدمات" },
  { id: "active", label: "الحسابات النشطة" },
  { id: "providers", label: "مقدمو الخدمات أصحاب الحسابات" },
];
const blankPreview = (): Preview => ({
  total: 0,
  byChannel: { inApp: 0, inbox: 0, email: 0, whatsapp: 0 },
  readiness: { inApp: false, inbox: false, email: false, whatsapp: false },
});

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
}

function formatCounts(counts: unknown): string {
  if (counts == null) return "لا توجد بيانات نتائج";
  if (typeof counts !== "object") return String(counts);
  const entries = Object.entries(counts as Record<string, unknown>);
  if (!entries.length) return "لا توجد بيانات نتائج";
  return entries.map(([key, value]) => {
    const label = CHANNELS.find((channel) => channel.id === key)?.label ?? key;
    const detail = value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).map(([result, count]) => `${({
        total: "المستهدفون",
        delivered: "تم التسليم",
        failed: "فشل",
        pending: "قيد الانتظار",
        sending: "جارٍ الإرسال",
      } as Record<string, string>)[result] ?? result}: ${String(count)}`).join("، ")
      : String(value);
    return `${label}: ${detail}`;
  }).join(" · ");
}

function isDeliveryPending(counts: unknown): boolean {
  if (!counts || typeof counts !== "object") return false;
  return Object.values(counts as Record<string, unknown>).some((channelCounts) => {
    if (!channelCounts || typeof channelCounts !== "object") return false;
    const channel = channelCounts as Record<string, unknown>;
    return Number(channel.pending) > 0 || Number(channel.sending) > 0;
  });
}

function hasDeliveryFailures(counts: unknown): boolean {
  if (!counts || typeof counts !== "object") return false;
  return Object.values(counts as Record<string, unknown>).some((channelCounts) =>
    Boolean(channelCounts && typeof channelCounts === "object" && Number((channelCounts as Record<string, unknown>).failed) > 0),
  );
}

export function BroadcastTab({ onNavigate }: { onNavigate?: (tab: "broadcastSettings") => void }) {
  const [audience, setAudience] = useState<Audience>("all");
  const [preview, setPreview] = useState<Preview>(blankPreview);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sending, setSending] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [resultCounts, setResultCounts] = useState<unknown>(null);
  const [sendError, setSendError] = useState("");
  const [attempt, setAttempt] = useState<{ signature: string; key: string } | null>(null);
  const [pollingCampaignId, setPollingCampaignId] = useState<number | string | null>(null);

  async function loadPreview(nextAudience: Audience) {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const response = await apiFetch(`/admin/broadcast/preview?audience=${nextAudience}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "تعذر تحميل معاينة الجمهور");
      setPreview({
        total: Number(data?.total) || 0,
        byChannel: { ...blankPreview().byChannel, ...(data?.byChannel ?? {}) },
        readiness: { ...blankPreview().readiness, ...(data?.readiness ?? {}) },
      });
      setChannels((current) => current.filter((channel) => Boolean(data?.readiness?.[channel])));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "تعذر تحميل معاينة الجمهور");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryError("");
    try {
      const response = await apiFetch("/admin/broadcast");
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "تعذر تحميل سجل الإرسال");
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "تعذر تحميل سجل الإرسال");
    }
  }

  useEffect(() => {
    void loadPreview(audience);
  }, [audience]);
  useEffect(() => { void loadHistory(); }, []);
  useEffect(() => {
    if (pollingCampaignId == null) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await apiFetch("/admin/broadcast");
        const data = await response.json().catch(() => null);
        if (!response.ok || stopped) return;
        const nextRows = Array.isArray(data?.rows) ? data.rows as BroadcastRow[] : [];
        setRows(nextRows);
        const campaign = nextRows.find((row) => String(row.id) === String(pollingCampaignId));
        if (!campaign) return;
        setResultCounts(campaign.counts);
        if (!isDeliveryPending(campaign.counts)) {
          setPollingCampaignId(null);
          setResultMessage(hasDeliveryFailures(campaign.counts)
            ? "اكتمل تنفيذ قائمة الإرسال مع وجود إخفاقات؛ راجع النتائج لكل قناة."
            : "اكتمل تنفيذ قائمة الإرسال. حالة التسليم النهائية موضحة لكل قناة.");
        } else {
          setResultMessage("التعميم في قائمة الانتظار أو قيد الإرسال. لم يتم تأكيد التسليم بعد؛ يتم تحديث الحالة تلقائياً.");
        }
      } catch {
        // Leave polling active; a later refresh will retry without implying delivery.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pollingCampaignId]);

  const signature = JSON.stringify({ title: title.trim(), body: body.trim(), audience, channels: [...channels].sort() });
  const expectedByChannel = (channel: Channel) => preview.byChannel[channel] ?? 0;

  function toggleChannel(channel: Channel) {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
    setResultMessage("");
    setResultCounts(null);
  }

  async function previewRecipients() {
    setRecipientsOpen(true);
    setRecipientsLoading(true);
    setRecipientsError("");
    setRecipients([]);
    setRecipientTotal(0);
    try {
      const selectedChannels = [...channels].sort();
      const query = new URLSearchParams({
        audience,
        channels: selectedChannels.join(","),
      });
      const response = await apiFetch(`/admin/broadcast/recipients?${query.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "تعذر تحميل قائمة المستلمين");
      const channelIds = new Set(CHANNELS.map(({ id }) => id));
      const rows = Array.isArray(data?.recipients) ? data.recipients : [];
      setRecipients(rows.map((recipient: Recipient) => ({
        key: String(recipient.key),
        name: String(recipient.name ?? ""),
        channels: Array.isArray(recipient.channels)
          ? recipient.channels.filter((channel): channel is Channel => channelIds.has(channel))
          : [],
      })));
      setRecipientTotal(Number(data?.total) || 0);
    } catch (error) {
      setRecipientsError(error instanceof Error ? error.message : "تعذر تحميل قائمة المستلمين");
    } finally {
      setRecipientsLoading(false);
    }
  }

  async function sendBroadcast() {
    if (!recipientsOpen || recipientsLoading || recipientsError || previewLoading || !title.trim() || !body.trim() || !channels.length || channels.some((channel) => !preview.readiness[channel]) || sending) return;
    const key = attempt?.signature === signature ? attempt.key : crypto.randomUUID();
    setAttempt({ signature, key });
    setSending(true);
    setSendError("");
    setResultMessage("");
    setResultCounts(null);
    try {
      const response = await apiFetch("/admin/broadcast", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), audience, channels }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok && response.status !== 207) throw new Error(data?.error ?? "تعذر إرسال التعميم");
      setResultCounts(data?.counts ?? null);
      if (response.status === 202) {
        setResultMessage("تم قبول التعميم ووضعه في قائمة الانتظار. لم يتم تأكيد التسليم بعد.");
        if (data?.id != null) setPollingCampaignId(data.id);
      } else if (response.status === 207) {
        setResultMessage("توجد نتائج جزئية؛ حالة كل قناة موضحة أدناه.");
      } else {
        setResultMessage("تم تسجيل التعميم. راجع حالة كل قناة أدناه.");
      }
      setRecipientsOpen(false);
      setAttempt(null);
      await loadHistory();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "تعذر إرسال التعميم");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300"><Megaphone className="h-5 w-5" /></span>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">التعميمات</h1>
          <p className="text-sm text-slate-400">إرسال رسائل للملاك ومقدمي الخدمات ومراجعة جاهزية القنوات.</p>
        </div>
        {onNavigate && <Button variant="outline" size="sm" onClick={() => onNavigate("broadcastSettings")} className="gap-2">
          <Settings className="h-4 w-4" /> إعدادات قنوات الإرسال
        </Button>}
      </header>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full max-w-sm space-y-2">
            <label className="text-sm font-semibold text-slate-200">الجمهور المستهدف</label>
            <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
              <SelectTrigger className="border-slate-700 bg-slate-950 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>{AUDIENCES.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadPreview(audience)} disabled={previewLoading} className="gap-2">
            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} تحديث المعاينة
          </Button>
        </div>
        {previewError && <p role="alert" className="text-sm text-red-300">{previewError}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map(({ id, label }) => (
            <div key={id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-bold text-white">{previewLoading ? "…" : expectedByChannel(id).toLocaleString("ar-SA")}</p>
              <p className={`mt-2 text-xs font-semibold ${preview.readiness[id] ? "text-emerald-300" : "text-amber-300"}`}>
                {previewLoading ? "جارٍ التحقق من الجاهزية" : preview.readiness[id] ? "جاهزة للإرسال" : "غير مهيأة — معطلة"}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-300">
          {previewLoading ? "جارٍ احتساب الجمهور…" : `إجمالي الحسابات المستهدفة: ${preview.total.toLocaleString("ar-SA")}`}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-5">
        <h2 className="font-bold text-white">إنشاء تعميم</h2>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-200">العنوان</label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="border-slate-700 bg-slate-950 text-white" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-200">نص التعميم</label>
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className="border-slate-700 bg-slate-950 text-white" />
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-200">قنوات الإرسال (يمكن اختيار أكثر من قناة)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHANNELS.map(({ id, label }) => {
              const ready = preview.readiness[id] && !previewLoading;
              return <div key={id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${ready ? "border-slate-700 bg-slate-950/60" : "border-slate-800 bg-slate-950/30 opacity-60"}`}>
                <label htmlFor={`broadcast-channel-${id}`} className={`text-sm text-slate-200 ${ready ? "cursor-pointer" : "cursor-not-allowed"}`}>
                  {label}{ready && <span className="mr-2 text-xs text-slate-400">({expectedByChannel(id).toLocaleString("ar-SA")} متوقع)</span>}
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={ready ? undefined : 0} aria-label={ready ? undefined : `${label}: يتطلب إعداد القناة قبل استخدامها`} className={`inline-flex ${ready ? "" : "cursor-not-allowed rounded-sm focus:outline-none focus:ring-2 focus:ring-amber-400"}`}>
                      <input id={`broadcast-channel-${id}`} data-testid={`checkbox-broadcast-channel-${id}`} type="checkbox" checked={channels.includes(id)} disabled={!ready} onChange={() => toggleChannel(id)} className="h-4 w-4 accent-amber-400" />
                    </span>
                  </TooltipTrigger>
                  {!ready && <TooltipContent side="top"><p>تتطلب هذه القناة إعدادها قبل استخدامها.</p></TooltipContent>}
                </Tooltip>
              </div>;
            })}
          </div>
        </fieldset>
        {resultMessage && <div role="status" className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200 space-y-2">
          <p>{resultMessage}</p>
          {resultCounts != null && <p className="text-slate-300">نتائج القنوات: {formatCounts(resultCounts)}</p>}
        </div>}
        <Button onClick={() => void previewRecipients()} disabled={recipientsLoading || sending} className="gap-2" data-testid="button-preview-recipients">
          {recipientsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          معاينة المستلمين ({preview.total.toLocaleString("ar-SA")})
        </Button>
      </section>

      <Dialog open={recipientsOpen} onOpenChange={setRecipientsOpen}>
        <DialogContent className="border-slate-700 bg-slate-900 text-white" dir="rtl">
          <DialogHeader>
            <DialogTitle>معاينة مستلمي التعميم</DialogTitle>
            <DialogDescription className="text-slate-300">
              {recipientsLoading ? "جارٍ تحميل المستلمين…" : `عدد المستلمين: ${recipientTotal.toLocaleString("ar-SA")}`}
              {" "}قد يتغير العدد قبل إرسال التعميم.
            </DialogDescription>
          </DialogHeader>
          {sendError && <p role="alert" className="text-sm text-red-300">{sendError}</p>}
          {recipientsError && <p role="alert" className="text-sm text-red-300">{recipientsError}</p>}
          {recipientsLoading && <div role="status" className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل قائمة المستلمين…</div>}
          {!recipientsLoading && !recipientsError && !recipients.length && <p className="text-sm text-slate-300">لا يوجد مستلمون في هذه المعاينة.</p>}
          {!recipientsLoading && !recipientsError && recipients.length > 0 && <ul aria-label="قائمة المستلمين" className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-700 p-3">
            {recipients.map((recipient) => <li key={recipient.key} className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-2 last:border-0 last:pb-0">
              <span className="text-sm text-white">{recipient.name || recipient.key}</span>
              <span className="text-xs text-slate-400">
                {recipient.channels.map((channel) => CHANNELS.find(({ id }) => id === channel)?.label ?? channel).join("، ") || "لا توجد قناة محددة"}
              </span>
            </li>)}
          </ul>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecipientsOpen(false)} disabled={sending}>إلغاء</Button>
            <Button onClick={() => void sendBroadcast()} disabled={sending || recipientsLoading || previewLoading || Boolean(recipientsError) || !channels.length || channels.some((channel) => !preview.readiness[channel]) || !title.trim() || !body.trim()} className="gap-2" data-testid="button-confirm-broadcast">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد وإرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center gap-2 text-white"><History className="h-4 w-4 text-amber-300" /><h2 className="font-bold">سجل التعميمات</h2></div>
        {historyError && <p role="alert" className="text-sm text-red-300">{historyError}</p>}
        {!rows.length && !historyError && <p className="text-sm text-slate-400">لا توجد تعميمات سابقة.</p>}
        <div className="space-y-3">
          {rows.map((row) => <article key={row.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold text-white">{row.title}</h3>
              <time className="text-xs text-slate-400">{row.createdAt ? new Date(row.createdAt).toLocaleString("ar-SA") : "—"}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{row.body}</p>
            <p className="mt-3 text-xs text-slate-400">{AUDIENCES.find(({ id }) => id === row.audience)?.label ?? row.audience} · القنوات: {row.channels.map((channel) => CHANNELS.find(({ id }) => id === channel)?.label ?? channel).join("، ")}</p>
            <p className="mt-1 text-xs text-slate-300">الحالة: {isDeliveryPending(row.counts) ? "قيد التنفيذ" : hasDeliveryFailures(row.counts) ? "اكتمل مع إخفاقات" : "اكتمل"} · {formatCounts(row.counts)}</p>
          </article>)}
        </div>
      </section>
    </div>
  );
}