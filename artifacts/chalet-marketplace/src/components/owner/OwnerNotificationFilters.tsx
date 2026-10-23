import { Search, X } from "lucide-react";
import type { NotificationFilters } from "@/lib/ownerNotificationFilters";

export function OwnerNotificationFilters({ filters, onChange }: {
  filters: NotificationFilters;
  onChange: (filters: NotificationFilters) => void;
}) {
  return <div dir="rtl" className="flex w-full flex-wrap items-center gap-2 text-right sm:w-auto">
    <div className="relative w-full min-w-0 sm:w-64">
      <Search aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <input type="search" aria-label="البحث باسم العميل أو العقار أو رقم الحجز"
        placeholder="اسم العميل / العقار / رقم الحجز"
        value={filters.search} onChange={e => onChange({ ...filters, search: e.target.value })}
        className="h-9 w-full rounded-lg border border-input bg-background pl-3 pr-8 text-right text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
    <select aria-label="حالة قراءة الإشعارات" value={filters.read}
      onChange={e => onChange({ ...filters, read: e.target.value as NotificationFilters["read"] })}
      className="h-9 min-w-0 rounded-lg border border-input bg-background px-2 text-right text-xs focus-visible:ring-2 focus-visible:ring-ring">
      <option value="all">عرض الكل</option>
      <option value="unread">غير المقروءة فقط</option>
    </select>
    <select aria-label="النطاق الزمني للإشعارات" value={filters.time}
      onChange={e => onChange({ ...filters, time: e.target.value as NotificationFilters["time"] })}
      className="h-9 min-w-0 rounded-lg border border-input bg-background px-2 text-right text-xs focus-visible:ring-2 focus-visible:ring-ring">
      <option value="all">كل الفترات</option>
      <option value="today">اليوم</option>
      <option value="week">هذا الأسبوع</option>
      <option value="month">هذا الشهر</option>
    </select>
    {(filters.search || filters.read !== "all" || filters.time !== "all") && <button type="button"
      onClick={() => onChange({ search: "", read: "all", time: "all" })}
      className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted">
      <X className="h-3.5 w-3.5" />مسح الفلاتر
    </button>}
  </div>;
}
