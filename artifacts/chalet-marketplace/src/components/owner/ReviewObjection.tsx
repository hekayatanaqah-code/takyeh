import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** The caller supplies its existing owner-authenticated transport and scope. */
export function ReviewObjection({ endpoint, reportedAt, refreshKey, request }: {
  endpoint: string;
  reportedAt?: string | null;
  refreshKey: readonly unknown[];
  request: (url: string, options: RequestInit) => Promise<Response>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await request(endpoint, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "تعذر إرسال الاعتراض، حاول مجددًا");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: refreshKey });
      setOpen(false);
      setReason("");
    },
  });
  if (reportedAt) return (
    <p role="status" className="text-xs text-amber-700 dark:text-amber-400">اعتراضك قيد مراجعة الإدارة</p>
  );
  return (
    <div className="space-y-2">
      {!open ? <Button variant="outline" size="sm" onClick={() => { mutation.reset(); setOpen(true); }}>اعتراض على التقييم</Button> : (
        <div className="rounded-xl border border-amber-300 p-3 space-y-2">
          <label className="text-sm font-semibold">سبب الاعتراض على التقييم</label>
          <p className="text-xs text-muted-foreground">وضح سبب عدم إنصاف التقييم أو مخالفته. يبقى منشورًا حتى تراجعه الإدارة وتقرر حذفه أو إبقاءه.</p>
          <Textarea aria-label="سبب الاعتراض على التقييم" value={reason} onChange={event => setReason(event.target.value)}
            maxLength={500} disabled={mutation.isPending} placeholder="اكتب سبب الاعتراض (إلزامي)" />
          {mutation.isError && <p role="alert" className="text-sm text-red-600">{mutation.error.message}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={!reason.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "جارٍ الإرسال..." : "إرسال الاعتراض"}
            </Button>
            <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => { setOpen(false); setReason(""); }}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}
