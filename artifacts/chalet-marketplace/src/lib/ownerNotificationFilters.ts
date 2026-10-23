import { ownerNotificationPresentation } from "./ownerNotificationPresentation";

export type NotificationReadFilter = "all" | "unread";
export type NotificationTimeFilter = "all" | "today" | "week" | "month";
export interface NotificationFilters {
  search: string;
  read: NotificationReadFilter;
  time: NotificationTimeFilter;
}
interface SearchableNotification {
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  bookingId?: number | null;
  clientName?: string | null;
  propertyName?: string | null;
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/\s+/g, " ").trim();
}

/** Saudi calendar periods; the week starts on Sunday, not the last seven days. */
export function notificationTimeBounds(time: NotificationTimeFilter, now = new Date()) {
  if (time === "all") return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const value = (key: string) => Number(parts.find(p => p.type === key)?.value);
  const calendarDate = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  if (time === "week") calendarDate.setUTCDate(calendarDate.getUTCDate() - calendarDate.getUTCDay());
  if (time === "month") calendarDate.setUTCDate(1);
  const end = new Date(calendarDate);
  if (time === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (time === "week" ? 7 : 1));
  const offset = 3 * 60 * 60 * 1000;
  return { start: calendarDate.getTime() - offset, end: end.getTime() - offset };
}

export function filterOwnerNotifications<T extends SearchableNotification>(notifications: T[], filters: NotificationFilters, now = new Date()): T[] {
  const terms = normalize(filters.search).split(" ").filter(Boolean);
  const bounds = notificationTimeBounds(filters.time, now);
  return notifications.filter(n => {
    if (filters.read === "unread" && n.isRead) return false;
    if (bounds) {
      const timestamp = new Date(n.createdAt).getTime();
      if (!Number.isFinite(timestamp) || timestamp < bounds.start || timestamp >= bounds.end) return false;
    }
    if (!terms.length) return true;
    // Search visible content, not expiry timestamps, private tags or encoded URLs.
    const text = normalize([
      ownerNotificationPresentation(n.message, n.type).text,
      n.clientName ?? "", n.propertyName ?? "",
    ].join(" "));
    const bookingId = n.bookingId ?? n.message.match(/\[booking:(\d+)\]/)?.[1];
    return terms.every(term => /^\#?\d+$/.test(term)
      ? bookingId != null && String(bookingId).includes(term.replace(/^#/, ""))
      : text.includes(term));
  });
}
