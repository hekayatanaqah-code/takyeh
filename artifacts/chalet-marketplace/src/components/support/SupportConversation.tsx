import React from "react";
import { FileText, ExternalLink, Lock, Send, Loader2, ShieldCheck, User } from "lucide-react";

export type SupportConversationMessage = {
  id: number | string;
  author_role: "owner" | "admin";
  body: string;
  attachment_urls: string[];
  created_at: string | null;
  author_name?: string | null;
};

export interface SupportConversationProps {
  messages: SupportConversationMessage[];
  audience: "owner" | "admin";
  closed: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  error?: string;
  composerExtras?: React.ReactNode;
}

export const SUPPORT_CONVERSATION_MAX_LENGTH = 2000;

function safeUrl(url: string): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.href : null;
  } catch {
    return null;
  }
}

function isPdf(url: string) {
  return url.toLowerCase().split("?")[0].endsWith(".pdf") || url.toLowerCase().includes(".pdf");
}

function fmtDateTime(value: string | null): string {
  if (!value) return "وقت غير مسجّل";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "وقت غير مسجّل";
  try {
    return d.toLocaleString("ar-SA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d.toLocaleString("ar-SA");
  }
}

export function SupportConversation({
  messages,
  audience,
  closed,
  draft,
  onDraftChange,
  onSend,
  sending,
  error,
  composerExtras,
}: SupportConversationProps) {
  const isAdmin = audience === "admin";
  const canSend = !sending && draft.trim().length > 0 && draft.length <= SUPPORT_CONVERSATION_MAX_LENGTH;

  const t = isAdmin
    ? {
        wrap: "border-white/10 bg-white/[0.02]",
        heading: "text-gray-300",
        empty: "text-gray-500 border-white/10",
        mine: "bg-amber-900/25 border-amber-700/40 text-amber-50",
        theirs: "bg-white/5 border-white/10 text-gray-100",
        meta: "text-gray-400",
        link: "bg-amber-900/30 border-amber-700/40 text-amber-300 hover:bg-amber-900/50",
        imgBorder: "border-white/15",
        input: "bg-black/30 border-white/15 text-gray-100 placeholder:text-gray-500 focus:border-amber-500/60",
        counter: "text-gray-500",
        btn: "bg-amber-600 hover:bg-amber-500 text-white",
        locked: "bg-white/5 border-white/10 text-gray-300",
        err: "text-red-400 bg-red-900/20 border-red-700/40",
      }
    : {
        wrap: "border-gray-200 dark:border-gray-700/60 bg-white/50 dark:bg-gray-900/30",
        heading: "text-gray-700 dark:text-gray-300",
        empty: "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",
        mine: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40 text-gray-900 dark:text-amber-50",
        theirs: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40 text-gray-900 dark:text-blue-50",
        meta: "text-gray-500 dark:text-gray-400",
        link: "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50",
        imgBorder: "border-gray-200 dark:border-gray-700",
        input: "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-amber-500",
        counter: "text-gray-400",
        btn: "bg-amber-600 hover:bg-amber-700 text-white",
        locked: "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
        err: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40",
      };

  return (
    <div dir="rtl" className={`rounded-xl border p-3 sm:p-4 space-y-3 ${t.wrap}`}>
      <p className={`text-xs font-semibold ${t.heading}`}>المحادثة</p>

      {messages.length === 0 ? (
        <p className={`text-xs text-center border border-dashed rounded-lg py-4 ${t.empty}`}>
          لا توجد ردود بعد{closed ? "." : " — اكتب رسالتك أدناه لمتابعة المحادثة."}
        </p>
      ) : (
        <ol className="space-y-3">
          {messages.map((m) => {
            const mine = m.author_role === audience;
            const fromAdmin = m.author_role === "admin";
            const name = m.author_name?.trim() || (fromAdmin ? "فريق الدعم" : "المالك");
            const urls = (m.attachment_urls ?? []).map(safeUrl).filter((u): u is string => !!u);
            return (
              <li key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                <div className={`w-full sm:max-w-[85%] rounded-xl border p-3 space-y-2 ${mine ? t.mine : t.theirs}`}>
                  <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] ${t.meta}`}>
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {fromAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                      {name}
                      {mine && <span className="font-normal opacity-80">(أنت)</span>}
                    </span>
                    <time dateTime={m.created_at ?? undefined}>{fmtDateTime(m.created_at)}</time>
                  </div>
                  {m.body && (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</div>
                  )}
                  {urls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {urls.map((url, i) =>
                        isPdf(url) ? (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                            className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors ${t.link}`}>
                            <FileText className="w-3.5 h-3.5" />
                            مرفق PDF {urls.length > 1 ? `(${i + 1})` : ""}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        ) : (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-fit">
                            <img src={url} alt={`مرفق ${i + 1}`} loading="lazy"
                              className={`max-h-48 max-w-[min(100%,18rem)] rounded-lg border object-cover hover:opacity-90 transition-opacity ${t.imgBorder}`} />
                          </a>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {closed ? (
        <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${t.locked}`}>
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">هذه التذكرة مغلقة</p>
            <p className="text-xs opacity-80 mt-0.5">
              {isAdmin ? "لا يمكن إضافة ردود على تذكرة مغلقة." : "لا يمكن إضافة ردود جديدة. إن احتجت مساعدة أخرى فافتح تذكرة جديدة."}
            </p>
          </div>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) onSend();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value.slice(0, SUPPORT_CONVERSATION_MAX_LENGTH))}
            maxLength={SUPPORT_CONVERSATION_MAX_LENGTH}
            rows={3}
            disabled={sending}
            aria-label="نص الرد"
            placeholder={isAdmin ? "اكتب ردّك على المالك..." : "اكتب رسالتك لفريق الدعم..."}
            className={`w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none transition-colors disabled:opacity-60 ${t.input}`}
          />
          {composerExtras}
          {error && <p role="alert" className={`text-xs rounded-lg border px-3 py-2 ${t.err}`}>{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] tabular-nums ${t.counter}`}>
              {draft.length} / {SUPPORT_CONVERSATION_MAX_LENGTH}
            </span>
            <button
              type="submit"
              disabled={!canSend}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${t.btn}`}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "جارٍ الإرسال..." : "إرسال"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default SupportConversation;
