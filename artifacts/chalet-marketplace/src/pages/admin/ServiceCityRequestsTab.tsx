import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ServiceCityRequestRecord } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AdminFetch = (path: string, options?: RequestInit) => Promise<Response>;
type Region = { id: number; name: string; isActive: boolean };
type Decision = { id: number; decision: "approve" | "reject"; regionId?: number; reason?: string };
const labels = { pending: "معلقة", approved: "مقبولة", rejected: "مرفوضة" } as const;
const colors = {
  pending: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  approved: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  rejected: "bg-red-500/15 text-red-200 border-red-500/40",
};
async function checkedJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "تعذّر تنفيذ العملية؛ حاول مجدداً");
  if (body == null) throw new Error("تعذّر قراءة البيانات؛ حاول مجدداً");
  return body as T;
}
const dateFormat = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
});

function RequestCard({ request, regions, pending, decide }: {
  request: ServiceCityRequestRecord; regions: Region[]; pending: boolean; decide: (decision: Decision) => void;
}) {
  const [regionId, setRegionId] = useState(request.regionId ? String(request.regionId) : "");
  const [reason, setReason] = useState("");
  const submit = (decision: Decision["decision"]) => decide({
    id: request.id, decision, regionId: regionId ? Number(regionId) : undefined, reason: reason.trim() || undefined,
  });
  return <article className="rounded-xl border border-slate-700 bg-slate-800 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold text-white">{request.city}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{request.requesterName} · {request.regionName || "المنطقة غير محددة"}</p>
        <p className="mt-1 text-sm text-slate-400">{dateFormat.format(new Date(request.createdAt))}</p>
      </div>
      <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${colors[request.status]}`}>{labels[request.status]}</span>
    </div>
    {request.status === "pending" ? <div className="mt-5 space-y-4">
      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor={`city-region-${request.id}`}>المنطقة التابعة للمدينة</label>
        <Select value={regionId} onValueChange={setRegionId} disabled={pending} dir="rtl">
          <SelectTrigger id={`city-region-${request.id}`} className="bg-slate-900 border-slate-600 text-white"><SelectValue placeholder="اختر المنطقة قبل الموافقة" /></SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">{regions.filter(r => r.isActive).map(region =>
            <SelectItem key={region.id} value={String(region.id)} className="text-white focus:bg-slate-700">{region.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label htmlFor={`city-reason-${request.id}`} className="mb-2 block text-sm font-semibold text-slate-200">ملاحظة أو سبب الرفض <span className="font-normal text-slate-400">اختياري</span></label>
        <Textarea id={`city-reason-${request.id}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={2} disabled={pending} className="bg-slate-900 border-slate-600 text-white" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending || !regions.some(r => r.isActive && r.id === Number(regionId))} onClick={() => submit("approve")} className="bg-emerald-700 hover:bg-emerald-600 text-white">الموافقة وإضافة المدينة</Button>
        <Button variant="outline" disabled={pending} onClick={() => submit("reject")} className="border-red-500/60 text-red-300 hover:bg-red-950">رفض الطلب</Button>
      </div>
    </div> : <div className="mt-4 border-t border-slate-700 pt-4 text-sm leading-relaxed text-slate-300">
      {request.status === "approved" ? "أُضيفت المدينة إلى قائمة مدن الخدمات المعتمدة." : "تم رفض الطلب دون إضافة المدينة."}
      {request.reason && <p className="mt-2 whitespace-pre-wrap">{request.reason}</p>}
      {request.reviewedAt && <p className="mt-2 text-slate-400">تاريخ المراجعة: {dateFormat.format(new Date(request.reviewedAt))}</p>}
    </div>}
  </article>;
}

export function ServiceCityRequestsTab({ apiFetch }: { apiFetch: AdminFetch }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ServiceCityRequestRecord["status"]>("pending");
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const requests = useQuery<ServiceCityRequestRecord[]>({
    queryKey: ["admin", "service-city-requests"],
    queryFn: async () => checkedJson(await apiFetch("/admin/service-city-requests")),
    refetchInterval: 30_000,
  });
  const regions = useQuery<Region[]>({
    queryKey: ["admin", "service", "regions"],
    queryFn: async () => checkedJson(await apiFetch("/admin/service-regions")),
  });
  const mutation = useMutation({
    mutationFn: async ({ id, ...body }: Decision) => checkedJson<ServiceCityRequestRecord>(await apiFetch(`/admin/service-city-requests/${id}/decision`, { method: "POST", body: JSON.stringify(body) })),
    onSuccess: updated => {
      qc.setQueryData<ServiceCityRequestRecord[]>(["admin", "service-city-requests"], previous => previous?.map(row => row.id === updated.id ? updated : row));
      for (const key of [["admin", "service-city-requests"], ["admin", "service"], ["service-locations"], ["service-cities"]]) {
        void qc.invalidateQueries({ queryKey: key });
      }
      setFeedback({ error: false, text: updated.status === "approved" ? "تمت الموافقة وإضافة المدينة إلى مدن الخدمات المعتمدة." : "تم رفض الطلب بنجاح." });
    },
    onError: (error: Error) => {
      setFeedback({ error: true, text: /[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذّر حفظ القرار؛ حاول مجدداً" });
      void qc.invalidateQueries({ queryKey: ["admin", "service-city-requests"] });
    },
  });
  const rows = requests.data ?? [];
  return <section dir="rtl" className="space-y-5">
    <div><h2 className="text-xl font-bold text-white">طلبات المدن الجديدة</h2>
      <p className="mt-2 text-base leading-relaxed text-slate-300">راجع المدن التي طلبها مقدمو الخدمات. الموافقة تضيف المدينة إلى مدن الخدمات فقط، ولا تغيّر مدن العقارات.</p></div>
    <div role="group" aria-label="حالة طلبات المدن" className="flex flex-wrap gap-2">
      {(Object.keys(labels) as Array<keyof typeof labels>).map(value => <Button key={value} variant={status === value ? "default" : "outline"} aria-pressed={status === value}
        className={status === value ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-slate-800 border-slate-600 text-slate-200"}
        onClick={() => setStatus(value)}>{labels[value]} ({rows.filter(row => row.status === value).length.toLocaleString("ar-SA")})</Button>)}
    </div>
    {feedback && <p role={feedback.error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${feedback.error ? colors.rejected : colors.approved}`}>{feedback.text}</p>}
    {(requests.isError || regions.isError) && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">
      تعذّر تحميل الطلبات أو المناطق. <Button variant="outline" className="mr-2" onClick={() => { void requests.refetch(); void regions.refetch(); }}>إعادة المحاولة</Button>
    </div>}
    {requests.isLoading ? <p className="text-slate-300">جارٍ تحميل الطلبات…</p> : !requests.isError && rows.filter(row => row.status === status).length === 0
      ? <p className="rounded-xl border border-slate-700 bg-slate-800 p-8 text-center text-slate-300">لا توجد طلبات {labels[status]}.</p>
      : <div className="grid gap-4 xl:grid-cols-2">{rows.filter(row => row.status === status).map(request => <RequestCard key={request.id} request={request} regions={regions.data ?? []} pending={mutation.isPending} decide={value => { setFeedback(null); mutation.mutate(value); }} />)}</div>}
  </section>;
}
