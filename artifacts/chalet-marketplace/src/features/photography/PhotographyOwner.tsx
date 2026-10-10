import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, ORIGIN, sar, fmtDT, fmtT, Field, inputCls, btnCls, cardCls, Skel, ErrorBox, Empty, Notice, StatusPill, type Pkg, type Booking } from "./shared";

interface Catalog {
  enabled: boolean; readiness: { payment: boolean; whatsapp: boolean };
  properties: { id: number; nameAr: string; location?: string; district?: string; whatsappNumber?: string }[];
  services: { id: number; nameAr: string; location?: string }[];
  packages: Pkg[];
  photographers: { id: number; name: string; bio?: string }[];
}
interface Slot { startAt: string; endAt: string }
const CK = ["ph-owner-catalog"], BK = ["ph-owner-bookings"];

function ConfirmResult() {
  const qc = useQueryClient();
  const ran = useRef(false);
  const [state, setState] = useState<{ kind: "idle" | "loading" | "ok" | "err"; text?: string; extra?: string[] }>({ kind: "idle" });
  useEffect(() => {
    if (ran.current) return;
    const sp = new URLSearchParams(window.location.search);
    const id = Number(sp.get("photographyBooking"));
    if (!sp.get("photographyBooking")) return;
    ran.current = true;
    if (!Number.isInteger(id) || id <= 0) { setState({ kind: "err", text: "رقم الحجز في الرابط غير صالح" }); return; }
    setState({ kind: "loading" });
    call<{ booking: Booking; notifications?: unknown }>(`/photography/bookings/${id}/confirm`, "POST")
      .then((r) => setState({ kind: "ok", text: `تم تأكيد حجز ${r.booking.packageName} لنشاط ${r.booking.propertyName} بتاريخ ${fmtDT(r.booking.startAt)}` }))
      .catch((e: Error) => setState({ kind: "err", text: e.message }))
      .finally(() => qc.invalidateQueries({ queryKey: BK }));
    const u = new URL(window.location.href); u.searchParams.delete("photographyBooking");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  }, [qc]);
  if (state.kind === "idle") return null;
  if (state.kind === "loading") return <Notice tone="warn">جار التحقق من الدفع مع مزود الدفع</Notice>;
  return <Notice tone={state.kind === "ok" ? "ok" : "err"}>{state.kind === "ok" ? state.text : `لم يتم تأكيد الحجز: ${state.text}`}</Notice>;
}

function Booker({ cat }: { cat: Catalog }) {
  const qc = useQueryClient();
  const [activityKey, setP] = useState(""); const [photographerId, setPh] = useState("");
  const activities = [
    ...cat.properties.map(p => ({ ...p, kind: "property" as const })),
    ...cat.services.map(s => ({ ...s, kind: "service" as const })),
  ];
  const activity = activities.find(a => `${a.kind}:${a.id}` === activityKey);
  const target = activity ? activity.kind === "property" ? { propertyId: activity.id } : { serviceSubmissionId: activity.id } : null;
  const [packageId, setPk] = useState(""); const [date, setDate] = useState(""); const [slot, setSlot] = useState<Slot | null>(null);
  const ready = !!target && photographerId && date;
  const slots = useQuery({
    queryKey: ["ph-slots", activityKey, photographerId, date], enabled: !!ready,
    queryFn: () => call<{ slots: Slot[]; timezone: string }>(`/photography/slots?${activity!.kind === "property" ? "propertyId" : "serviceSubmissionId"}=${activity!.id}&photographerId=${photographerId}&date=${date}`),
  });
  const pay = useMutation({
    mutationFn: async () => {
      if (!target || !slot) throw new Error("اختر النشاط والموعد أولاً");
      const b = await call<{ booking: Booking }>("/photography/bookings", "POST", { ...target, photographerId: Number(photographerId), packageId: Number(packageId), startAt: slot.startAt });
      return call<{ paymentUrl: string }>(`/photography/bookings/${b.booking.id}/checkout`, "POST", { origin: ORIGIN() });
    },
    onSuccess: (r) => { window.location.assign(r.paymentUrl); },
    onError: () => { qc.invalidateQueries({ queryKey: ["ph-slots"] }); setSlot(null); },
  });
  const pkg = cat.packages.find((p) => String(p.id) === packageId);
  const pickable = cat.readiness.payment;
  return (
    <section className={`${cardCls} space-y-4`}>
      <h3 className="font-bold">طلب جلسة تصوير</h3>
      {!pickable && <Notice tone="warn">الدفع غير جاهز حاليا، لا يمكن إتمام الحجز.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="العقار أو الخدمة"><select className={inputCls} value={activityKey} onChange={(e) => { setP(e.target.value); setSlot(null); }} data-testid="select-property">
          <option value="">اختر العقار أو الخدمة</option>{activities.map(a => <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{a.kind === "property" ? "عقار" : "خدمة"} — {a.nameAr}</option>)}</select></Field>
        <Field label="المصور"><select className={inputCls} value={photographerId} onChange={(e) => { setPh(e.target.value); setSlot(null); }} data-testid="select-photographer">
          <option value="">اختر المصور</option>{cat.photographers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="الباقة"><select className={inputCls} value={packageId} onChange={(e) => setPk(e.target.value)} data-testid="select-package">
          <option value="">اختر الباقة</option>{cat.packages.map((p) => <option key={p.id} value={p.id}>{p.name} - {sar(p.priceHalalas)}</option>)}</select></Field>
        <Field label="التاريخ (توقيت السعودية)"><input type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} data-testid="input-date" /></Field>
      </div>
      {ready && (slots.isLoading ? <Skel n={1} /> : slots.isError ? <ErrorBox error={slots.error} onRetry={() => slots.refetch()} /> :
        (slots.data?.slots ?? []).length === 0 ? <Empty title="لا توجد مواعيد متاحة في هذا اليوم" text="جرب تاريخا آخر أو مصورا آخر." /> : (
          <div className="flex flex-wrap gap-2">
            {slots.data!.slots.map((s) => (
              <button key={s.startAt} type="button" aria-pressed={slot?.startAt === s.startAt} onClick={() => setSlot(s)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${slot?.startAt === s.startAt ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
                {fmtT(s.startAt)} - {fmtT(s.endAt)}
              </button>
            ))}
          </div>
        ))}
      {pay.isError && <ErrorBox error={pay.error} />}
      <button className={btnCls} disabled={!pickable || !target || !slot || !packageId || pay.isPending} onClick={() => pay.mutate()} data-testid="button-checkout">
        {pay.isPending ? "جار التحويل إلى الدفع" : `الدفع عبر بوابة الدفع${pkg ? ` (${sar(pkg.priceHalalas)})` : ""}`}
      </button>
      <p className="text-xs text-muted-foreground">يتم حجز الموعد لمدة ١٥ دقيقة حتى إتمام الدفع في صفحة الدفع الآمنة.</p>
    </section>
  );
}

export default function PhotographyOwner() {
  const cat = useQuery({ queryKey: CK, queryFn: () => call<Catalog>("/photography/catalog"), refetchInterval: 30000 });
  const bk = useQuery({ queryKey: BK, queryFn: () => call<{ bookings: Booking[] }>("/photography/bookings"), refetchInterval: 30000 });
  return (
    <div className="space-y-5" dir="rtl" data-testid="photography-owner">
      <h2 className="text-xl font-bold">التصوير الاحترافي</h2>
      <ConfirmResult />
      {cat.isLoading ? <Skel /> : cat.isError || !cat.data ? <ErrorBox error={cat.error} onRetry={() => cat.refetch()} /> :
        !cat.data.enabled ? (
          <div className={`${cardCls} text-center`} data-testid="photography-coming-soon">
            <p className="text-2xl font-bold">قريباً</p>
            <p className="mt-1 text-sm text-muted-foreground">خدمة التصوير الاحترافي غير متاحة حاليا.</p>
          </div>
        ) : cat.data.properties.length + cat.data.services.length === 0 ? <Empty title="لا توجد أنشطة مؤهلة للتصوير" text="تأكد من وجود عقار أو خدمة معتمدة ونشطة ومن اكتمال بيانات موقعها." /> :
          cat.data.packages.length === 0 || cat.data.photographers.length === 0 ? <Empty title="لا تتوفر باقات أو مصورون معتمدون حاليا" /> : <Booker cat={cat.data} />}
      {(cat.data?.enabled || (bk.data?.bookings.length ?? 0) > 0) && (
        <section className="space-y-3">
          <h3 className="font-bold">حجوزاتي</h3>
          {bk.isLoading ? <Skel n={2} /> : bk.isError ? <ErrorBox error={bk.error} onRetry={() => bk.refetch()} /> :
            (bk.data?.bookings ?? []).length === 0 ? <Empty title="لا توجد حجوزات تصوير" /> :
              bk.data!.bookings.map((b) => (
                <div key={b.id} className={`${cardCls} flex flex-wrap items-center justify-between gap-2`} data-testid={`card-booking-${b.id}`}>
                  <div><p className="font-bold">{b.packageName} - {b.propertyName}</p><p className="text-sm text-muted-foreground">{b.photographerName} - {fmtDT(b.startAt)}</p></div>
                  <div className="text-start"><StatusPill s={b.status} /><p className="mt-1 text-sm">{sar(b.priceHalalas)}</p></div>
                </div>
              ))}
        </section>
      )}
    </div>
  );
}
