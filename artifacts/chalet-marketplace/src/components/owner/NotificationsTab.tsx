import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { filterOwnerNotifications, type NotificationFilters } from "@/lib/ownerNotificationFilters";
import { activityKey, notificationInActivity } from "@/lib/dashboardActivity";
import { OwnerNotificationCard } from "@/components/owner/OwnerNotificationCard";
import { motion } from "framer-motion";
import { Loader2, Bell, Check } from "lucide-react";
import { OwnerNotificationFilters } from "@/components/owner/OwnerNotificationFilters";
import { Button } from "@/components/ui/button";
import { useAdminFinance } from "@/components/owner/OwnerDashboardContexts";
import { apiFetch } from "@/components/owner/owner-api";
import { PaginationBar, useListPagination } from "@/components/owner/finance-shared";
import { toArN } from "@/components/owner/owner-formatting";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


/* ── Notifications Tab ────────────────────────── */
interface OwnerNotifRow {
  id: number; type: string; chaletId: number | null; reviewId: number | null;
  bookingId?: number | null; clientName?: string | null; propertyName?: string | null;
  submissionId?: number | null; providerId?: number | null;
  message: string; isRead: boolean; createdAt: string;
}

type NotifFilter = "all" | "new_booking" | "booking_reminder";

export function NotificationsTab({ deduplicate = false }: { deduplicate?: boolean }) {
  const { unit } = useAdminFinance();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<NotifFilter>("all");
  const [filters, setFilters] = useState<NotificationFilters>({ search: "", read: "all", time: "all" });

  const { data: rawNotifications = [], isLoading, isError } = useQuery<OwnerNotifRow[]>({
    queryKey: ["owner", "notifications", "history"],
    queryFn: async () => {
      const r = await apiFetch("/owner/notifications?history=true");
      if (!r.ok) throw new Error("تعذر تحميل الإشعارات");
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/owner/notifications/read-all", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unit.type === "chalet" ? { chaletId: unit.id, submissionId: unit.submissionId }
          : unit.type === "service" ? { providerId: unit.id } : {}),
      });
      if (!r.ok) throw new Error("تعذر تحديد الإشعارات كمقروءة");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "notifications"] });
      qc.invalidateQueries({ queryKey: ["owner", "notifications-summary"] });
    },
  });

  const allNotifs = deduplicate
    ? (() => {
        const seen = new Set<string>();
        return rawNotifications.filter(n => {
          const day = (n.createdAt as string | undefined)?.slice(0, 10) ?? "";
          const key = `${n.type ?? ""}|${day}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
      })()
    : rawNotifications;

  const scopedNotifs = allNotifs.filter(n => notificationInActivity(n, unit));
  const matchingNotifs = filterOwnerNotifications(scopedNotifs, filters);
  const filtered = activeFilter === "all" ? matchingNotifs : matchingNotifs.filter(n => n.type === activeFilter);

  const notificationPagination = useListPagination(filtered, JSON.stringify([activeFilter, filters, activityKey(unit)]));
  const unread = scopedNotifs.filter(n => !n.isRead);

  const TABS: { key: NotifFilter; label: string; icon: string }[] = [
    { key: "all",              label: "الكل",           icon: "🔔" },
    { key: "new_booking",      label: "حجوزات جديدة",   icon: "📅" },
    { key: "booking_reminder", label: "تذكيرات",         icon: "⏰" },
  ];

  function renderNotif(n: OwnerNotifRow) {
    return <OwnerNotificationCard key={n.id} notification={n} />;
  }

  return (
    <motion.div dir="rtl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-right">
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-base text-foreground">الإشعارات</h2>
              {unread.length > 0 && (
                <p className="text-xs text-muted-foreground">{toArN(unread.length)} غير مقروء</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OwnerNotificationFilters filters={filters} onChange={setFilters} />
            <SectionGuideButton sectionKey="notifications" />
            {unread.length > 0 && (
              <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs px-3"
                onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
                {markAllRead.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                تحديد الكل كمقروء
              </Button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-border bg-muted/10">
          {TABS.map(tab => {
            const count = tab.key === "all" ? matchingNotifs.length : matchingNotifs.filter(n => n.type === tab.key).length;
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {toArN(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <p role="alert" className="px-5 py-10 text-sm text-destructive">تعذر تحميل الإشعارات. يرجى المحاولة مجددًا.</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Bell className="w-9 h-9 opacity-20" />
            <p className="text-sm">لا توجد إشعارات تطابق البحث والفلاتر المحددة</p>
          </div>
        ) : (
          <>
            <div ref={notificationPagination.tableRef} className="max-h-[480px] overflow-y-auto divide-y divide-border/60 overscroll-contain scroll-mt-4">
              {notificationPagination.paginatedItems.map(renderNotif)}
            </div>
            <PaginationBar
              page={notificationPagination.page}
              pageSize={notificationPagination.pageSize}
              totalItems={filtered.length}
              totalPages={notificationPagination.totalPages}
              onPageChange={notificationPagination.goToPage}
              onPageSizeChange={notificationPagination.changePageSize}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}
