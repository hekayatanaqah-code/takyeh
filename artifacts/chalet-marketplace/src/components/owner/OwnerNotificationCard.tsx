import { Phone } from "lucide-react";
import { ownerNotificationDate, ownerNotificationPresentation } from "@/lib/ownerNotificationPresentation";

export interface OwnerNotification {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function OwnerNotificationCard({ notification: n }: { notification: OwnerNotification }) {
  const { text, waHref } = ownerNotificationPresentation(n.message, n.type);
  const date = ownerNotificationDate(n.createdAt);
  const icon = n.type === "new_booking" ? "📅" : n.type === "new_review" ? "⭐" : n.type === "report_dismissed" ? "🚩" : n.type === "booking_reminder" ? "⏰" : n.type === "subscription_expiry_reminder" ? "⏳" : "🔔";
  const rowBg = n.isRead ? "bg-card" : n.type === "new_booking"
    ? "bg-green-50 dark:bg-green-900/15 border-r-2 border-green-400"
    : n.type === "booking_reminder" ? "bg-amber-50 dark:bg-amber-900/15 border-r-2 border-amber-400"
    : "bg-primary/5 border-r-2 border-primary/40";

  return <div dir="rtl" className={`flex items-start gap-3 px-5 py-3.5 text-right text-sm transition-colors ${rowBg}`}>
    <span aria-hidden="true" className="mt-0.5 shrink-0 text-base">{icon}</span>
    <div className="min-w-0 flex-1 text-right">
      <p className={`whitespace-pre-line break-words leading-7 ${n.isRead ? "text-muted-foreground" : "text-foreground font-medium"}`}>
        {text.split(/([0-9٠-٩][0-9٠-٩.,٬٫]*\s*\u20c1)/g).map((part, index) =>
          part.includes("\u20c1")
            ? <bdi key={index} dir="rtl" className="inline-block whitespace-nowrap">{part}</bdi>
            : <span key={index}>{part}</span>
        )}
      </p>
      {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-green-600">
        <Phone className="h-3 w-3" />إرسال على واتساب
      </a>}
      <div className="mt-1 flex flex-wrap justify-start gap-x-2 gap-y-0.5 text-right text-[11px] leading-5 text-muted-foreground/80">
        {typeof date === "string" ? date : <>
          <span>{date.hijri}</span>
          <span>({date.gregorian})</span>
          <span>· {date.time}</span>
        </>}
      </div>
    </div>
    {!n.isRead && <span aria-label="غير مقروء" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
  </div>;
}
