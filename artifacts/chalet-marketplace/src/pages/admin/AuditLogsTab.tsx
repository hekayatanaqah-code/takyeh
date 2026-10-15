import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, User, Activity, Database, Server, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const API = "/api";

interface AuditLog {
  id: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  method: string | null;
  path: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const sensitiveAuditKey = /(password|hash|secret|token|payment|phone|mobile|email|personal)/i;

function sanitizeAuditSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[محتوى متداخل]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditSnapshot(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitiveAuditKey.test(key))
        .slice(0, 50)
        .map(([key, item]) => [key, sanitizeAuditSnapshot(item, depth + 1)]),
    );
  }
  if (typeof value === "string") return value.slice(0, 500);
  return value;
}

export function AuditLogsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const { data, isLoading } = useQuery<{ items: AuditLog[]; total: number } | AuditLog[]>({
    queryKey: ["admin", "audit-logs", page, search, actionFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) qs.set("search", search);
      if (actionFilter !== "all") qs.set("method", actionFilter);
      const r = await fetch(`${API}/admin/audit-logs?${qs.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const logs = Array.isArray(data) ? data : data?.items || [];
  const hasMore = Array.isArray(data) ? logs.length === 50 : (data?.total || 0) > page * 50;

  const getActionColor = (method?: string | null) => {
    switch (method?.toUpperCase()) {
      case "POST": return "text-green-400 bg-green-500/10";
      case "PUT":
      case "PATCH": return "text-blue-400 bg-blue-500/10";
      case "DELETE": return "text-red-400 bg-red-500/10";
      default: return "text-slate-300 bg-slate-500/10";
    }
  };

  const getActionLabel = (action: string) => {
    const map: Record<string, string> = {
      login: "تسجيل دخول",
      logout: "تسجيل خروج",
      create: "إنشاء",
      update: "تحديث",
      delete: "حذف",
      approve: "موافقة",
      reject: "رفض",
      owner_emergency_password_reset: "إعادة تعيين طارئة لكلمة مرور مالك",
    };
    return map[action] || action;
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            سجل العمليات (Audit Logs)
          </h2>
          <p className="text-xs text-slate-500 mt-1">تتبع كافة الإجراءات والتغييرات في النظام</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input 
              placeholder="ابحث بالاسم، المعرّف، الكيان..."
              className="pl-3 pr-9 h-9 bg-slate-900 border-slate-700 text-sm focus:border-amber-500"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36 h-9 bg-slate-900 border-slate-700 text-sm">
              <SelectValue placeholder="نوع العملية" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              <SelectItem value="all">جميع العمليات</SelectItem>
              <SelectItem value="POST">إنشاء وإجراءات</SelectItem>
              <SelectItem value="PATCH">تعديلات</SelectItem>
              <SelectItem value="DELETE">حذف</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold w-40">التاريخ والوقت</th>
                <th className="px-4 py-3 font-semibold w-48">المستخدم</th>
                <th className="px-4 py-3 font-semibold">الإجراء</th>
                <th className="px-4 py-3 font-semibold">الكيان (Entity)</th>
                <th className="px-4 py-3 font-semibold w-24 text-center">الطلب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-500" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">لا توجد سجلات تطابق بحثك</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/80 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("ar-SA", { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-200 font-medium truncate max-w-[120px]" title={log.actorName || log.actorId || "نظام"}>
                          {log.actorName || log.actorId || "النظام"}
                        </span>
                      </div>
                      {typeof log.metadata?.reason === "string" && (
                        <div className="mt-2 space-y-1 text-xs leading-6" data-testid={`audit-reset-reason-${log.id}`}>
                          <p className="text-amber-200">سبب التغيير: {log.metadata.reason}</p>
                          <p className="text-slate-400">الحالة: {log.metadata.status === "completed" ? "نُفّذت" : log.metadata.status === "failed" ? "لم تُنفّذ" : "قيد التحقق"}</p>
                          <p className="text-slate-300">الحساب المستهدف: {typeof log.metadata.targetOwnerId === "string" ? log.metadata.targetOwnerId : log.entityId}</p>
                          {log.metadata.whatsappNotification && typeof log.metadata.whatsappNotification === "object" ? (
                            <p className="text-slate-400">تنبيه واتساب: {(log.metadata.whatsappNotification as { status?: string }).status === "accepted" ? "قبِل مزوّد واتساب الرسالة (لا يثبت استلامها)" : "لم يُؤكد الإرسال"}</p>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-300 font-medium">{getActionLabel(log.action)}</span>
                      </div>
                      {log.metadata && ("before" in log.metadata || "after" in log.metadata) && (
                        <details className="mt-2 max-w-[420px] text-xs">
                          <summary className="cursor-pointer text-amber-400 hover:text-amber-300">
                            عرض تفاصيل التغيير
                          </summary>
                          {typeof log.metadata.targetOwnerId === "string" && (
                            <div className="mt-2 text-slate-400">
                              حساب المالك: <span className="font-mono text-slate-300">{log.metadata.targetOwnerId}</span>
                            </div>
                          )}
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {(["before", "after"] as const).map((key) => (
                              <div key={key} className="min-w-0 rounded border border-slate-700 bg-slate-950/60 p-2">
                                <div className="mb-1 font-semibold text-slate-400">{key === "before" ? "قبل" : "بعد"}</div>
                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-300" dir="auto">
                                  {JSON.stringify(sanitizeAuditSnapshot(log.metadata?.[key] ?? null), null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.entityType ? (
                        <div className="flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-slate-300 font-mono text-xs">{log.entityType}</span>
                          {log.entityId && <span className="text-slate-500 font-mono text-[10px]">#{log.entityId}</span>}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {log.method ? (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${getActionColor(log.method)}`}>
                          {log.method}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-3 bg-slate-900/40 border-t border-slate-700 flex justify-between items-center">
          <span className="text-xs text-slate-500">
            الصفحة {page}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" 
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="h-8 border-slate-700 text-slate-300">
              السابق
            </Button>
            <Button size="sm" variant="outline" 
              onClick={() => setPage(p => p + 1)} disabled={!hasMore}
              className="h-8 border-slate-700 text-slate-300">
              التالي
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
