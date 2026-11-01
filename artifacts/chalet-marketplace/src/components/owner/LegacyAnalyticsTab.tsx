import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Home, BarChart2, TrendingUp, Zap, Activity, PieChart } from "lucide-react";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { useAdminFinance } from "@/components/owner/OwnerDashboardContexts";
import { OwnerBooking } from "@/components/owner/owner-booking-types";
import { apiFetch } from "@/components/owner/owner-api";


/* ── (AnalyticsTab removed — consolidated into RevenueTab) ── */
function _AnalyticsTab_REMOVED() {
  const { unit } = useAdminFinance();
  const fmtN = (value: number) => value.toLocaleString("ar-SA");

  const { data: allBookings = [], isLoading } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings-analytics"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  // Filter by chalet unit if needed
  const scopedBookings = useMemo(() => {
    if (unit.type === "chalet") return allBookings.filter(b => (b as any).chaletId === (unit as any).id);
    return allBookings;
  }, [allBookings, unit]);

  // Aggregate totals + monthly breakdown
  const { totalBaseRent, totalAddonRevenue, monthlyData, topServices } = useMemo(() => {
    const addonMap: Record<string, number> = {};
    const byMonth: Record<string, { month: string; baseRent: number; services: number }> = {};
    let totalBaseRent = 0;
    let totalAddonRevenue = 0;

    for (const b of scopedBookings) {
      if (!b.totalPrice || !b.bookingDate) continue;
      const tp = Number(b.totalPrice);
      const addons = (b.bookedAddons ?? []) as Array<{ id: number; name: string; price: string; unit: string }>;
      const paidAddons = addons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0);
      const addonSum = paidAddons.reduce((s, a) => s + Math.round(Number(a.price)), 0);
      const baseRent = tp - addonSum;

      totalBaseRent += baseRent;
      totalAddonRevenue += addonSum;

      // Monthly bucketing (YYYY-MM)
      const monthKey = b.bookingDate.slice(0, 7);
      if (!byMonth[monthKey]) byMonth[monthKey] = { month: monthKey, baseRent: 0, services: 0 };
      byMonth[monthKey].baseRent += baseRent;
      byMonth[monthKey].services += addonSum;

      for (const a of paidAddons) {
        addonMap[a.name] = (addonMap[a.name] ?? 0) + Math.round(Number(a.price));
      }
    }

    // Last 6 months sorted ascending for the chart
    const now = new Date();
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("ar-SA", { month: "short", year: "2-digit", calendar: "gregory" });
      return {
        label,
        "إيجار أساسي": Math.round(byMonth[key]?.baseRent ?? 0),
        "خدمات ومرافق": Math.round(byMonth[key]?.services ?? 0),
      };
    });

    const topServices = Object.entries(addonMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return { totalBaseRent: Math.round(totalBaseRent), totalAddonRevenue: Math.round(totalAddonRevenue), monthlyData, topServices };
  }, [scopedBookings]);

  const grandTotal = totalBaseRent + totalAddonRevenue;
  const basePct = grandTotal > 0 ? Math.round((totalBaseRent / grandTotal) * 100) : 0;
  const addonPct = 100 - basePct;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-3 gap-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-2xl" />)}</div>
        <div className="h-64 bg-muted rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <PieChart className="w-5 h-5 text-violet-600" />
        <h2 className="text-lg font-extrabold text-foreground">الإحصائيات والتقارير</h2>
        {unit.type === "chalet" && (
          <span className="text-xs bg-primary/10 text-primary font-semibold px-2.5 py-0.5 rounded-full">{(unit as any).name}</span>
        )}
      </div>

      {grandTotal === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <BarChart2 className="w-12 h-12 opacity-30" />
          <p className="text-sm font-medium">لا توجد بيانات إيرادات بعد</p>
          <p className="text-xs">ستظهر الإحصائيات هنا بعد تسجيل أول حجز</p>
        </div>
      ) : (
        <>
          {/* ── 3 KPI Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1 — Base Rent */}
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/20 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wide">
                <Home className="w-4 h-4" />
                إجمالي إيرادات الإيجار
              </div>
              <div className="text-3xl font-extrabold text-primary tabular-nums">
                {fmtN(totalBaseRent)}
                <span className="text-base font-normal text-muted-foreground ms-1.5">ر.س</span>
              </div>
              <div className="text-[11px] text-primary/70 font-medium">
                {basePct.toLocaleString("ar-SA")}٪ من صافي الدخل الكلي
              </div>
              {/* Mini bar */}
              <div className="h-1.5 rounded-full bg-primary/20 overflow-hidden">
                <div style={{ width: `${basePct}%` }} className="h-full bg-primary rounded-full" />
              </div>
            </div>

            {/* Card 2 — Service Fees */}
            <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-2 border-amber-400/30 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-amber-600 text-xs font-bold uppercase tracking-wide">
                <Zap className="w-4 h-4" />
                إجمالي إيرادات الخدمات
              </div>
              <div className="text-3xl font-extrabold text-amber-600 tabular-nums">
                {fmtN(totalAddonRevenue)}
                <span className="text-base font-normal text-muted-foreground ms-1.5">ر.س</span>
              </div>
              <div className="text-[11px] text-amber-600/80 font-medium">
                {addonPct.toLocaleString("ar-SA")}٪ من صافي الدخل الكلي
              </div>
              {/* Mini bar */}
              <div className="h-1.5 rounded-full bg-amber-400/20 overflow-hidden">
                <div style={{ width: `${addonPct}%` }} className="h-full bg-amber-500 rounded-full" />
              </div>
            </div>

            {/* Card 3 — Net Total */}
            <div className="bg-gradient-to-br from-green-500/5 to-emerald-500/10 border-2 border-green-400/30 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-xs font-bold uppercase tracking-wide">
                <RiyalIcon className="w-4 h-4" />
                صافي الدخل الكلي
              </div>
              <div className="text-3xl font-extrabold text-green-700 dark:text-green-400 tabular-nums">
                {fmtN(grandTotal)}
                <span className="text-base font-normal text-muted-foreground ms-1.5">ر.س</span>
              </div>
              <div className="text-[11px] text-green-600/80 font-medium">
                إيجار أساسي + خدمات ومرافق
              </div>
              {/* Stacked mini bar */}
              <div className="h-1.5 rounded-full overflow-hidden flex gap-px">
                <div style={{ width: `${basePct}%` }} className="h-full bg-primary rounded-r-full" />
                <div style={{ width: `${addonPct}%` }} className="h-full bg-amber-500 rounded-l-full" />
              </div>
            </div>
          </div>

          {/* ── Bar Chart: monthly breakdown ── */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-bold text-foreground">مقارنة مصادر الإيراد — آخر ٦ أشهر</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${(v/1000).toFixed(0)}k` : "0"} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12, direction: "rtl" }}
                  formatter={(v: number, name: string) => [`${fmtN(v)} ر.س`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, direction: "rtl" }} />
                <Bar dataKey="إيجار أساسي" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="خدمات ومرافق" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
            {/* Legend note */}
            <div className="flex gap-5 mt-2 justify-center text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />إيجار أساسي</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />خدمات ومرافق</span>
            </div>
          </div>

          {/* ── Contribution bar ── */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-bold text-foreground">نسبة مساهمة كل مصدر</span>
              <span className="ms-auto text-xs font-bold tabular-nums text-muted-foreground">{fmtN(grandTotal)} ر.س إجمالاً</span>
            </div>
            <div className="h-8 rounded-xl overflow-hidden flex gap-px shadow-inner">
              {basePct > 0 && (
                <div style={{ width: `${basePct}%` }} className="bg-primary flex items-center justify-center text-xs font-bold text-white transition-all duration-700">
                  {basePct > 8 ? `${basePct.toLocaleString("ar-SA")}٪` : ""}
                </div>
              )}
              {addonPct > 0 && (
                <div style={{ width: `${addonPct}%` }} className="bg-amber-500 flex items-center justify-center text-xs font-bold text-white transition-all duration-700">
                  {addonPct > 8 ? `${addonPct.toLocaleString("ar-SA")}٪` : ""}
                </div>
              )}
            </div>
            <div className="flex gap-6 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                إيجار أساسي — {fmtN(totalBaseRent)} ر.س
              </span>
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                خدمات ومرافق — {fmtN(totalAddonRevenue)} ر.س
              </span>
            </div>
          </div>

          {/* ── Top Services ── */}
          {topServices.length > 0 && (
            <div className="bg-card border border-amber-200 dark:border-amber-800/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-bold text-foreground">أكثر الخدمات تحقيقاً للأرباح</span>
                <span className="ms-auto text-[10px] text-muted-foreground">من إجمالي إيرادات الخدمات</span>
              </div>
              <div className="space-y-3">
                {topServices.map((svc, i) => {
                  const pct = totalAddonRevenue > 0 ? Math.round((svc.total / totalAddonRevenue) * 100) : 0;
                  const medals = ["🥇", "🥈", "🥉", "٤", "٥", "٦"];
                  const barClrs = ["bg-amber-500", "bg-amber-400", "bg-yellow-500", "bg-orange-400", "bg-amber-300", "bg-yellow-400"];
                  return (
                    <div key={svc.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          <span className="text-base leading-none">{medals[i]}</span>
                          {svc.name}
                        </span>
                        <span className="font-extrabold text-amber-600 tabular-nums">{fmtN(svc.total)} ر.س</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div style={{ width: `${pct}%` }} className={`h-full rounded-full transition-all duration-500 ${barClrs[i] ?? "bg-amber-500"}`} />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-left">{pct.toLocaleString("ar-SA")}٪</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {topServices.length === 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/20 rounded-2xl p-5 text-center">
              <Zap className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">لا توجد بيانات خدمات مدفوعة بعد</p>
              <p className="text-xs text-amber-600/70 mt-1">ستظهر قائمة أفضل الخدمات هنا عند حجز الضيوف لخدمات مدفوعة</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
