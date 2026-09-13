import { useQuery } from "@tanstack/react-query";
import { 
  BarChart3, Loader2, Home, Wrench, CheckCircle, TrendingUp,
  AlertCircle, ArrowLeftRight, Clock, ShieldCheck, Mail, AlertTriangle, Play
} from "lucide-react";
import { toAr } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from "recharts";

const API = "/api";

const MONTH_AR: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس", "04": "أبريل",
  "05": "مايو", "06": "يونيو", "07": "يوليو", "08": "أغسطس",
  "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر", "12": "ديسمبر"
};

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  pending: "قيد الانتظار",
  paused: "موقوف مؤقتاً",
  deleted: "محذوف"
};

interface SmartAlert {
  type: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  entityId?: string | number;
  expiresAt?: string;
  daysRemaining?: number;
  messageCreatedAt?: string;
}

export function OverviewTab() {
  const { data: analytics, isLoading: isAnalyticsLoading, isError: isAnalyticsError } = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/analytics`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: smartDash, isLoading: isSmartLoading, isError: isSmartError } = useQuery({
    queryKey: ["admin", "smart-dashboard"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/smart-dashboard`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const isLoading = isAnalyticsLoading || isSmartLoading;

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 flex-col gap-3">
      <Loader2 className="animate-spin text-amber-400 w-8 h-8" />
      <p className="text-slate-500 text-sm">جارٍ تحميل الإحصائيات الذكية…</p>
    </div>
  );

  const d = analytics;
  const alerts: SmartAlert[] = smartDash?.alerts || [];
  
  const fmtN = (n: number) => toAr(Math.round(n).toLocaleString());

  const weeklyPerf = d?.weeklyPerformance || [];
  const monthlyPerf = d?.monthlyPerformance || [];

  if (isAnalyticsError || isSmartError) {
    return (
      <div className="rounded-2xl border border-red-800/60 bg-red-950/30 p-6 text-center" dir="rtl">
        <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-red-400" />
        <p className="font-bold text-red-200">تعذّر تحميل ملخص لوحة التحكم</p>
        <p className="mt-1 text-xs text-red-300/70">حدّث الصفحة، وإذا استمرت المشكلة راجع سجل التشغيل.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Smart Alerts Section */}
      <div className="space-y-3 mb-8">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            تنبيهات النظام الذكية
          </h3>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 text-emerald-300">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-bold">لا توجد تنبيهات عاجلة</p>
                <p className="mt-0.5 text-xs text-emerald-300/70">الاشتراكات والرسائل وطلبات الدعم لا تحتاج إلى إجراء فوري.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {alerts.map((alert, i) => {
              const Icon = alert.severity === "high" ? AlertTriangle : alert.severity === "medium" ? Clock : Mail;
              const color = alert.severity === "high" ? "text-red-400 bg-red-900/20 border-red-800/50" : 
                            alert.severity === "medium" ? "text-orange-400 bg-orange-900/20 border-orange-800/50" :
                            "text-blue-400 bg-blue-900/20 border-blue-800/50";
              return (
                <div key={i} className={`p-4 rounded-xl border flex gap-3 items-start ${color}`}>
                  <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm mb-1">{alert.title}</h4>
                    <p className="text-xs opacity-80 leading-relaxed">{alert.description}</p>
                    {alert.daysRemaining !== undefined && (
                      <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-black/20">
                        متبقي {toAr(alert.daysRemaining)} يوم
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
      </div>

      {/* KPI row */}
      {d && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إجمالي الشاليهات", value: fmtN(d.marketDistribution?.chalets ?? 0), icon: <Home className="w-4 h-4 text-amber-400" /> },
            { label: "الخدمات المسجّلة", value: fmtN(d.marketDistribution?.services ?? 0), icon: <Wrench className="w-4 h-4 text-blue-400" /> },
            { label: "الحسابات النشطة", value: fmtN(d.accountStatus?.find((s: any) => s.status === "active")?.count ?? 0), icon: <CheckCircle className="w-4 h-4 text-emerald-400" /> },
            { label: "إيرادات الاشتراكات", value: `${fmtN(d.monthlyRevenue?.reduce((s: any, r: any) => s + r.total, 0) ?? 0)} ر.س`, icon: <TrendingUp className="w-4 h-4 text-amber-400" /> },
          ].map(k => (
            <div key={k.label} className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">{k.icon}<span className="text-[10px] text-slate-500">{k.label}</span></div>
              <p className="text-xl font-bold text-slate-100">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Interactive Charts */}
      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              أداء الحجوزات (أسبوعي)
            </h3>
            {weeklyPerf.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-10">لا توجد بيانات</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={weeklyPerf} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => toAr(String(v))} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px", textAlign: "right" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    formatter={(val: number) => [toAr(val), "الحجوزات"]}
                  />
                  <Area type="monotone" dataKey="bookings" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorBookings)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
               الإيرادات المحصلة (شهري)
            </h3>
            {monthlyPerf.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-10">لا توجد بيانات</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyPerf} margin={{ top: 5, right: 0, left: -10, bottom: 0 }} barSize={30}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => toAr(String(v))} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px", textAlign: "right" }}
                    itemStyle={{ color: "#e2e8f0" }}
                    cursor={{ fill: "#1e293b" }}
                    formatter={(val: number) => [`${toAr(val)} ر.س`, "الإيرادات"]}
                  />
                   <Bar dataKey="collectedRevenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
