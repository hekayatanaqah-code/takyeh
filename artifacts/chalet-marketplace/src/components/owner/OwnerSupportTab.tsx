import SupportConversation, { type SupportConversationMessage } from "@/components/support/SupportConversation";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import type { SupportConversationReplyInput } from "@workspace/api-client-react";
import { CheckCircle, ChevronDown, Loader2, FileText, MessageSquare, X, Send, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import { toArN } from "@/components/owner/owner-formatting";
import { PaginationBar, useListPagination } from "@/components/owner/finance-shared";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


/* ── Owner Support Center Tab ────────────────────────────── */
interface OwnerSupportMsg {
  id: number;
  subject: string;
  message: string;
  status: string;
  source?: string | null;
  sender?: string | null;
  platform_message?: boolean;
  attachment_url?: string | null;
  attachment_urls?: string[];
  admin_reply: string | null;
  admin_reply_at: string | null;
  admin_attachment_url?: string | null;
  admin_attachment_urls?: string[];
  is_read_by_owner: boolean;
  created_at: string;
  messages?: SupportConversationMessage[];
}

const SUPPORT_STATUS_AR: Record<string, { label: string; color: string }> = {
  new:         { label: "قيد المراجعة", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40" },
  in_progress: { label: "قيد المعالجة", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40" },
  replied:     { label: "تم الرد",      color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40" },
  resolved:    { label: "مُغلق",         color: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40" },
  closed:      { label: "مُغلقة",        color: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40" },
  admin_message: { label: "رسالة من المنصة", color: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700/40" },
};

const SUPPORT_MAX_FILE_SIZE_MB = 5;
const SUPPORT_MAX_MESSAGE_LENGTH = 500;

export function OwnerSupportTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  function apiFetch(path: string, opts?: RequestInit) {
    return fetch(`${BASE}/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) }, ...opts });
  }

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/page-content`);
      if (!r.ok) return {};
      const rows: { key: string; value: string }[] = await r.json();
      return Object.fromEntries(rows.map((x) => [x.key, x.value]));
    },
    staleTime: 5 * 60 * 1000,
  });

  const SUBJECTS = [
    "طلب تعديل تقني",
    "مشكلة في لوحة التحكم",
    "اقتراح ميزة جديدة",
    "تحديث بيانات الشاليه/العقار",
    "الفواتير والاشتراكات",
    "أخرى",
  ];

  const [subject,      setSubject]      = useState("");
  const [message,      setMessage]      = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [error,        setError]        = useState("");
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [showForm,     setShowForm]     = useState(false);
  const [attachFiles,   setAttachFiles]   = useState<File[]>([]);
  const [attachPreviews,setAttachPreviews] = useState<(string | "pdf")[]>([]);
  const [uploading,    setUploading]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<number, string>>({});
  const [sendingReply, setSendingReply] = useState<number | null>(null);
  const replyInFlight = useRef(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    if (!newFiles.length) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
    for (const f of newFiles) {
      if (!allowed.includes(f.type)) { setError("يُسمح فقط بـ PNG, JPG, PDF"); return; }
      if (f.size > SUPPORT_MAX_FILE_SIZE_MB * 1024 * 1024) { setError(`حجم الملف يتجاوز الحد الأقصى (${SUPPORT_MAX_FILE_SIZE_MB}MB)`); return; }
    }
    setAttachFiles(prev => [...prev, ...newFiles].slice(0, 10));
    setError("");
    for (const f of newFiles) {
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => setAttachPreviews(prev => [...prev, ev.target?.result as string]);
        reader.readAsDataURL(f);
      } else {
        setAttachPreviews(prev => [...prev, "pdf"]);
      }
    }
    e.target.value = "";
  }

  function clearAttachment() {
    setAttachFiles([]);
    setAttachPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* Fetch message history */
  const { data: history = [], isLoading: histLoading, isError: histError } = useQuery<OwnerSupportMsg[]>({
    queryKey: ["owner", "support-requests"],
    queryFn: async () => {
      const r = await apiFetch("/owner/support-requests");
      if (!r.ok) throw new Error("تعذّر تحميل المحادثات");
      return r.json();
    },
    refetchInterval: 5_000,
  });

  async function sendTicketReply(id: number) {
    const draft = replyDrafts[id] ?? "";
    if (!draft.trim() || replyInFlight.current) return;
    replyInFlight.current = true;
    setSendingReply(id);
    setReplyErrors(previous => ({ ...previous, [id]: "" }));
    try {
      const body: SupportConversationReplyInput = { message: draft.trim() };
      const response = await apiFetch(`/owner/support-requests/${id}/reply`, {
        method: "POST", body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) void qc.invalidateQueries({ queryKey: ["owner", "support-requests"] });
        throw new Error(result.error ?? "تعذّر إرسال الرد");
      }
      if (!result.ticket || result.ticket.id !== id || !Array.isArray(result.ticket.messages)) {
        throw new Error("استجابة المحادثة غير مكتملة");
      }
      qc.setQueryData<OwnerSupportMsg[]>(["owner", "support-requests"], previous =>
        previous?.map(ticket => ticket.id === id ? { ...ticket, ...result.ticket } : ticket));
      setReplyDrafts(previous => ({ ...previous, [id]: previous[id] === draft ? "" : previous[id] }));
      void qc.invalidateQueries({ queryKey: ["owner", "support-requests"] });
      void qc.invalidateQueries({ queryKey: ["owner", "support-unread-count"] });
      void qc.invalidateQueries({ queryKey: ["admin", "support-requests"] });
    } catch (err) {
      setReplyErrors(previous => ({ ...previous, [id]: err instanceof Error ? err.message : "تعذّر إرسال الرد، احتُفظ بالمسودة" }));
    } finally {
      replyInFlight.current = false;
      setSendingReply(null);
    }
  }

  async function markRead(id: number) {
    await apiFetch(`/owner/support-requests/${id}/mark-read`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["owner", "support-requests"] });
    qc.invalidateQueries({ queryKey: ["owner", "support-unread-count"] });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!subject) { setError("اختر الموضوع"); return; }
    if (!message.trim() || message.trim().length < 10) { setError("الرجاء كتابة وصف مفصّل (١٠ أحرف على الأقل)"); return; }
    if (message.length > SUPPORT_MAX_MESSAGE_LENGTH) { setError(`الحد الأقصى لتفاصيل الطلب ${toArN(SUPPORT_MAX_MESSAGE_LENGTH)} حرف`); return; }
    setSubmitting(true);
    if (attachFiles.length > 0) setUploading(true);
    try {
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("message", message.trim());
      for (const f of attachFiles) fd.append("files", f);
      const r = await fetch(`${BASE}/api/owner/support-request`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setError(d?.error ?? "حدث خطأ، يرجى المحاولة مرة أخرى"); return; }
      setSubmitted(true);
      setShowForm(false);
      clearAttachment();
      qc.invalidateQueries({ queryKey: ["owner", "support-requests"] });
      toast({ title: "تم الإرسال ✓", description: "سيتواصل معك فريق الدعم في أقرب وقت" });
    } catch { setError("تعذّر الاتصال بالخادم"); }
    finally { setSubmitting(false); setUploading(false); }
  }

  const isPlatformMessage = (msg: OwnerSupportMsg) =>
    Boolean(msg.platform_message || msg.source === "admin_broadcast" || msg.sender === "platform" || (msg.id < 0 && msg.status === "admin_message"));
  const unreadReplies = history.filter((msg) =>
    !msg.is_read_by_owner && (isPlatformMessage(msg) || Boolean(msg.admin_reply)),
  ).length;
  const supportPagination = useListPagination(history, history.map(message => message.id).join("|"));

  return (
    <div className="max-w-2xl mx-auto space-y-5 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">مركز الدعم والطلبات</h2>
            <p className="text-xs text-muted-foreground">أرسل طلبك التقني أو اقتراحك مباشرةً لفريق تكية</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SectionGuideButton sectionKey="support" />
          <Button
            size="sm"
            onClick={() => { setShowForm(!showForm); setSubmitted(false); setSubject(""); setMessage(""); setError(""); }}
            className="gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            طلب جديد
          </Button>
        </div>
      </div>

      {/* Unread notification */}
      {unreadReplies > 0 && (
        <div className="flex items-center gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 rounded-xl px-4 py-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            لديك {unreadReplies === 1 ? "رسالة جديدة" : `${unreadReplies} رسائل جديدة`} من فريق تكية
          </p>
        </div>
      )}

      {/* Send form */}
      {showForm && !submitted && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold">الموضوع <span className="text-destructive">*</span></label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    subject === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-slate-700 dark:text-slate-200 border-border hover:border-primary hover:text-primary"
                  }`}
                >{s}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="owner-support-message" className="text-sm font-semibold">
              تفاصيل الطلب <span className="text-destructive">*</span>
              <span id="owner-support-message-hint" className="text-xs text-slate-700 dark:text-slate-200 font-normal mr-2">صِف المشكلة أو الطلب بوضوح</span>
            </label>
            <Textarea
              id="owner-support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={SUPPORT_MAX_MESSAGE_LENGTH}
              aria-describedby="owner-support-message-hint owner-support-message-count"
              placeholder="مثال: لاحظت أن لوحة التقويم لا تحفظ الأيام المغلقة بشكل صحيح عند..."
              rows={5}
              dir="rtl"
              className="resize-none text-foreground placeholder:text-slate-600 placeholder:opacity-100 dark:placeholder:text-slate-300"
            />
            <p id="owner-support-message-count" aria-live="polite" aria-atomic="true" className="text-xs font-medium text-slate-700 dark:text-slate-200 text-left">
              <bdi dir="ltr">{toArN(message.length)} / {toArN(SUPPORT_MAX_MESSAGE_LENGTH)}</bdi>{" "}حرف
            </p>
          </div>

          {/* File attachment */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-2">
              <Paperclip className="w-4 h-4 shrink-0 text-primary" />
              إرفاق صورة أو ملف المشكلة
              <span className="text-xs font-normal text-slate-700 dark:text-slate-200">
                (اختياري — <bdi dir="ltr">PNG, JPG, PDF</bdi> · حتى {toArN(SUPPORT_MAX_FILE_SIZE_MB)} ميجابايت لكل ملف)
              </span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border hover:border-primary/50 rounded-xl px-3 py-5 text-center text-slate-700 dark:text-slate-200 hover:text-primary transition-colors bg-muted/30 hover:bg-primary/5"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs font-medium">اضغط لإضافة ملفات أو صور (يمكن اختيار أكثر من واحد)</span>
            </button>
            {attachFiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-2 sm:grid-cols-3 lg:grid-cols-4">
                {attachFiles.map((f, i) => (
                  <div key={i} className="relative min-w-0 flex flex-col items-center justify-center gap-2 bg-muted/40 border border-border rounded-xl px-3 pb-3 pt-8 text-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                    {attachPreviews[i] === "pdf" ? (
                      <FileText className="w-5 h-5 text-red-500 shrink-0" />
                    ) : attachPreviews[i] ? (
                      <img src={attachPreviews[i]} alt="معاينة" className="w-10 h-10 rounded object-contain border border-border" />
                    ) : (
                      <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                    )}
                    </div>
                    <p dir="auto" title={f.name} className="w-full text-center text-xs font-medium text-foreground truncate">{f.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachFiles(prev => prev.filter((_, j) => j !== i));
                        setAttachPreviews(prev => prev.filter((_, j) => j !== i));
                      }}
                      aria-label={`إزالة المرفق ${f.name}`}
                      className="absolute top-1 start-1 w-6 h-6 rounded-full bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowForm(false); clearAttachment(); }}>إلغاء</Button>
            <Button type="submit" className="flex-1 gap-2" disabled={submitting || uploading}>
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />جاري رفع الملف...</> : submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {!uploading && "إرسال الطلب"}
            </Button>
          </div>
        </form>
      )}

      {submitted && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-2xl p-6 text-center space-y-3">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <p className="font-bold text-green-700 dark:text-green-400">تم إرسال طلبك بنجاح!</p>
          <p className="text-muted-foreground text-sm">سيتواصل معك فريق دعم تكية قريباً.</p>
          <Button variant="outline" size="sm" onClick={() => { setSubmitted(false); setShowForm(false); }}>حسناً</Button>
        </div>
      )}

      {/* Message history */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">سجل المراسلات</h3>
        {histLoading ? (
          <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : histError ? (
          <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">تعذّر تحميل المحادثات. ستتم إعادة المحاولة تلقائياً دون فقد مسودتك.</p>
        ) : history.length === 0 ? (
          <div className="text-center py-10 bg-muted/30 border border-border rounded-xl">
            <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">لا توجد رسائل سابقة</p>
            <p className="text-muted-foreground/60 text-xs mt-1">أرسل طلبك الأول عبر زر "طلب جديد" أعلاه</p>
          </div>
        ) : (
          <>
          <div ref={supportPagination.tableRef} className="space-y-3 scroll-mt-4">
          {supportPagination.paginatedItems.map((msg) => {
            const isExp = expandedId === msg.id;
            const platformMessage = isPlatformMessage(msg);
            const statusInfo = SUPPORT_STATUS_AR[msg.status] ?? { label: msg.status, color: "text-muted-foreground bg-muted border-border" };
            const hasUnread = !msg.is_read_by_owner && (platformMessage || Boolean(msg.admin_reply));
            return (
              <div
                key={msg.id}
                className={`border rounded-xl overflow-hidden transition-all ${platformMessage ? "border-violet-300 dark:border-violet-700/60" : hasUnread ? "border-blue-400 dark:border-blue-600" : "border-border"}`}
              >
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => {
                    setExpandedId(isExp ? null : msg.id);
                    if (!isExp && hasUnread) markRead(msg.id);
                  }}
                >
                  {hasUnread && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{msg.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(() => {
                      const d = new Date(msg.created_at);
                      const hc = toHijriComponents(d);
                      const isToday = new Date().toDateString() === d.toDateString();
                      const isYesterday = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
                      const hijriStr = `${toArN(hc.day)} ${HIJRI_MONTHS_AR[hc.month - 1]} ${toArN(hc.year)} هـ`;
                      const gregStr = d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
                      const timeStr = d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });
                      const label = isToday ? `اليوم، ${hijriStr}` : isYesterday ? `أمس، ${hijriStr}` : hijriStr;
                      return `${label} (${gregStr} م) | ${timeStr}`;
                    })()}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusInfo.color}`}>{statusInfo.label}</span>
                  {platformMessage && <span className="text-[10px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/40 px-2 py-0.5 rounded-full shrink-0">المرسل: المنصة</span>}
                  {!platformMessage && msg.admin_reply && msg.status === "replied" && <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700/40 px-2 py-0.5 rounded-full shrink-0">رد متاح</span>}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExp ? "rotate-180" : ""}`} />
                </div>
                {isExp && (
                  <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
                    {/* Owner message */}
                    <div>
                      <p className={`text-xs mb-1.5 font-medium ${platformMessage ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground"}`}>
                        {platformMessage ? "رسالة واردة من منصة تكية:" : "رسالتك:"}
                      </p>
                      <div className="bg-background border border-border rounded-lg p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.message}</div>
                      {(() => {
                        const urls = msg.attachment_urls?.length ? msg.attachment_urls : msg.attachment_url ? [msg.attachment_url] : [];
                        return urls.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {urls.map((url, i) => url.endsWith(".pdf") ? (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex min-h-10 items-center justify-center gap-2 text-center text-xs font-medium text-primary hover:underline border border-border rounded-lg px-3 py-2 bg-muted/30">
                                <FileText className="w-4 h-4 shrink-0 text-red-500" />
                                مرفق PDF {urls.length > 1 ? `(${i + 1})` : ""}
                              </a>
                            ) : (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="مرفق" className="max-h-40 rounded-lg border border-border object-cover hover:opacity-90 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {!platformMessage && (
                      <SupportConversation
                        messages={msg.messages?.length ? msg.messages : msg.admin_reply ? [{
                          id: `legacy-${msg.id}`, author_role: "admin", body: msg.admin_reply,
                          attachment_urls: msg.admin_attachment_urls?.length ? msg.admin_attachment_urls : msg.admin_attachment_url ? [msg.admin_attachment_url] : [],
                          created_at: msg.admin_reply_at,
                        }] : []}
                        audience="owner"
                        closed={msg.status === "resolved" || msg.status === "closed"}
                        draft={replyDrafts[msg.id] ?? ""}
                        onDraftChange={value => setReplyDrafts(previous => ({ ...previous, [msg.id]: value }))}
                        onSend={() => void sendTicketReply(msg.id)}
                        sending={sendingReply !== null}
                        error={replyErrors[msg.id]}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
          <PaginationBar
            page={supportPagination.page}
            pageSize={supportPagination.pageSize}
            totalItems={history.length}
            totalPages={supportPagination.totalPages}
            onPageChange={supportPagination.goToPage}
            onPageSizeChange={supportPagination.changePageSize}
          />
          </>
        )}
      </div>

      {/* Info note */}
      <div className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-xs text-muted-foreground leading-relaxed">
        <p className="font-semibold text-foreground mb-1">ملاحظة</p>
        <p>
          يتم مراجعة الطلبات خلال ٢٤–٤٨ ساعة. للاستفسارات العاجلة تواصل معنا مباشرةً عبر{" "}
          {siteSettings.platform_whatsapp ? (
            <a
              href={`https://wa.me/${siteSettings.platform_whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-green-600 dark:text-green-400 underline underline-offset-2 hover:text-green-700 transition-colors"
            >
              الواتساب
            </a>
          ) : (
            <span>الواتساب</span>
          )}
          .
        </p>
      </div>
    </div>
  );
}
