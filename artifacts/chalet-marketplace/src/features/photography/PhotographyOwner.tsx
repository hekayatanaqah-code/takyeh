import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OwnerReview } from "./operations";
import { OwnerWalletPanel, useOwnerWallet, useOwnerId, WALLET_KEY } from "./walletPanel";
import { walletCall, photoWalletUrl, isUncertain, useBookingWalletMarker } from "./walletOps";

type BookingMarker = ReturnType<typeof useBookingWalletMarker>;
const walletErrText = (e: unknown) => e instanceof Error ? e.message : "خطأ غير متوقع";

/** Resumes an uncertain wallet debit with the SAME bookingId (works even if photography is now OFF). */
function WalletBookingResume({ marker }: { marker: BookingMarker }) {
  const qc = useQueryClient();
  const m = marker.value;
  const [done, setDone] = useState<string | null>(null);
  const resume = useMutation({
    mutationFn: (id: number) => walletCall<{ booking: Booking }>(photoWalletUrl(`/photography/bookings/${id}/wallet-pay`), {}),
    onSuccess: (r, id) => { if (marker.value?.bookingId === id) marker.clear(); setDone(`تم تأكيد الحجز رقم ${r.booking.id.toLocaleString("ar-SA")} (${r.booking.packageName}) والدفع من المحفظة.`); },
    onError: (e, id) => { if (!isUncertain(e) && marker.value?.bookingId === id) marker.clear(); },
    onSettled: () => { qc.invalidateQueries({ queryKey: BK }); qc.invalidateQueries({ queryKey: WALLET_KEY }); qc.invalidateQueries({ queryKey: ["ph-slots"] }); },
  });
  if (done) return <Notice tone="ok"><span data-testid="text-wallet-resume-success">{done}</span></Notice>;
  if (!m) return resume.isError ? <ErrorBox error={new Error(`رفض الخادم الدفع من المحفظة ولم يُخصم أي مبلغ: ${walletErrText(resume.error)}`)} /> : null;
  return (
    <div className="space-y-2 rounded-2xl border border-[#8C6246]/40 bg-[#8C6246]/5 p-4 text-sm" role="status" data-testid="notice-wallet-booking-pending">
      <p className="font-bold">حجز تصوير بانتظار تأكيد الدفع من المحفظة</p>
      <p className="text-muted-foreground">الحجز رقم {m.bookingId.toLocaleString("ar-SA")} - {sar(m.priceHalalas)} - {fmtDT(m.startAt)}. قد يكون المبلغ خُصم بالفعل؛ التحقق يعيد إرسال العملية نفسها ولن يخصم مرتين أو ينشئ حجزاً جديداً.</p>
      {resume.isError && <p className="text-xs text-destructive">ما زالت النتيجة غير مؤكدة: {walletErrText(resume.error)}</p>}
      <button className={btnCls} disabled={resume.isPending} onClick={() => resume.mutate(m.bookingId)} data-testid="button-wallet-booking-resume">{resume.isPending ? "جار التحقق" : "التحقق من الدفع وإكماله"}</button>
    </div>
  );
}
import { FIN_STATUS_AR, PAY_METHOD_AR, DEST_AR, RefundStatusPill } from "./money";
import { call, ORIGIN, sar, fmtDT, fmtT, Field, inputCls, btnCls, cardCls, Skel, ErrorBox, Empty, Notice, StatusPill, AssignmentBadge, type Pkg, type Booking } from "./shared";

interface Catalog {
  enabled: boolean; readiness: { payment: boolean; whatsapp: boolean };
  properties: { id: number; nameAr: string; location?: string; district?: string; whatsappNumber?: string }[];
  services: { id: number; nameAr: string; location?: string }[];
  packages: Pkg[];
  photographers?: { id: number; name: string; bio?: string }[];
}
interface Slot { startAt: string; endAt: string }
const slotKey = (s: Slot) => `${s.startAt}|${s.endAt}`;
const mins = (s: Slot) => Math.round((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60000);
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

function Booker({ cat, marker }: { cat: Catalog; marker: BookingMarker }) {
  const qc = useQueryClient();
  const [activityKey, setP] = useState("");
  const activities = [
    ...cat.properties.map(p => ({ ...p, kind: "property" as const })),
    ...cat.services.map(s => ({ ...s, kind: "service" as const })),
  ];
  const activity = activities.find(a => `${a.kind}:${a.id}` === activityKey);
  const target = activity ? activity.kind === "property" ? { propertyId: activity.id } : { serviceSubmissionId: activity.id } : null;
  const [packageId, setPk] = useState(""); const [date, setDate] = useState(""); const [slot, setSlot] = useState<Slot | null>(null);
  const ready = !!target && !!date;
  const slots = useQuery({
    queryKey: ["ph-slots", activityKey, date], enabled: !!ready,
    queryFn: () => call<{ slots: Slot[]; timezone: string }>(`/photography/slots?${activity!.kind === "property" ? "propertyId" : "serviceSubmissionId"}=${activity!.id}&date=${date}`),
  });
  const pay = useMutation({
    mutationFn: async () => {
      if (!target || !slot) throw new Error("اختر النشاط والموعد أولاً");
      const b = await call<{ booking: Booking }>("/photography/bookings", "POST", { ...target, packageId: Number(packageId), startAt: slot.startAt, endAt: slot.endAt });
      return call<{ paymentUrl: string }>(`/photography/bookings/${b.booking.id}/checkout`, "POST", { origin: ORIGIN() });
    },
    onSuccess: (r) => { window.location.assign(r.paymentUrl); },
    onError: () => { qc.invalidateQueries({ queryKey: ["ph-slots"] }); setSlot(null); },
  });
  const wallet = useOwnerWallet();
  const [walletDone, setWalletDone] = useState<string | null>(null);
  const lock = useRef(false);
  const walletPay = useMutation({
    mutationFn: async () => {
      if (!target || !slot || !pkg) throw new Error("اختر النشاط والباقة والموعد أولاً");
      if (marker.value) throw new Error("توجد عملية دفع من المحفظة قيد التحقق؛ أكملها أولاً.");
      const b = await call<{ booking: Booking }>("/photography/bookings", "POST", { ...target, packageId: Number(packageId), startAt: slot.startAt, endAt: slot.endAt });
      // Persist the reservation BEFORE debiting so a lost response is resumed, never re-booked.
      if (!marker.save({ bookingId: b.booking.id, packageId, activityKey, startAt: slot.startAt, endAt: slot.endAt, priceHalalas: b.booking.priceHalalas ?? pkg.priceHalalas, createdAt: new Date().toISOString() })) {
        throw new Error("تعذّر حفظ مرجع الحجز في المتصفح؛ لم يُرسل طلب الخصم. الموعد المحجوز مؤقتاً سيُحرَّر تلقائياً.");
      }
      try {
        return await walletCall<{ booking: Booking }>(photoWalletUrl(`/photography/bookings/${b.booking.id}/wallet-pay`), {});
      } catch (e) {
        if (!isUncertain(e)) marker.clear();
        throw e;
      }
    },
    onSuccess: (r) => {
      marker.clear();
      setWalletDone(`تم تأكيد حجز ${r.booking.packageName} لنشاط ${r.booking.propertyName} بتاريخ ${fmtDT(r.booking.startAt)} وخصم ${sar(r.booking.priceHalalas)} من محفظتك.`);
      setSlot(null);
    },
    onError: (e) => { if (!isUncertain(e)) setSlot(null); },
    onSettled: () => {
      lock.current = false;
      qc.invalidateQueries({ queryKey: BK }); qc.invalidateQueries({ queryKey: WALLET_KEY }); qc.invalidateQueries({ queryKey: ["ph-slots"] });
    },
  });
  const pkg = cat.packages.find((p) => String(p.id) === packageId);
  const pickable = cat.readiness.payment;
  const balance = wallet.data?.balanceHalalas ?? 0;
  const walletCovers = !!pkg && !!wallet.data && balance >= pkg.priceHalalas;
  const anyPending = pay.isPending || walletPay.isPending || !!marker.value;
  return (
    <section className={`${cardCls} space-y-4`}>
      <h3 className="font-bold">طلب جلسة تصوير</h3>
      {!pickable && <Notice tone="warn">الدفع غير جاهز حاليا، لا يمكن إتمام الحجز.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="العقار أو الخدمة"><select className={inputCls} value={activityKey} onChange={(e) => { setP(e.target.value); setSlot(null); }} data-testid="select-property">
          <option value="">اختر العقار أو الخدمة</option>{activities.map(a => <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{a.kind === "property" ? "عقار" : "خدمة"} — {a.nameAr}</option>)}</select></Field>
        <Field label="الباقة"><select className={inputCls} value={packageId} onChange={(e) => setPk(e.target.value)} data-testid="select-package">
          <option value="">اختر الباقة</option>{cat.packages.map((p) => <option key={p.id} value={p.id}>{p.name} - {sar(p.priceHalalas)}</option>)}</select></Field>
        <Field label="التاريخ (توقيت السعودية)"><input type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} data-testid="input-date" /></Field>
      </div>
      {ready && (slots.isLoading ? <Skel n={1} /> : slots.isError ? <ErrorBox error={slots.error} onRetry={() => slots.refetch()} /> :
        (slots.data?.slots ?? []).length === 0 ? <Empty title="لا توجد مواعيد متاحة في هذا اليوم" text="جرب تاريخا آخر." /> : (
          <div className="flex flex-wrap gap-2">
            {slots.data!.slots.map((s) => (
              <button key={slotKey(s)} type="button" aria-pressed={!!slot && slotKey(slot) === slotKey(s)} onClick={() => setSlot(s)} data-testid={`button-slot-${slotKey(s)}`}
                className={`flex flex-col items-center rounded-xl border px-3 py-2 text-sm font-semibold ${slot && slotKey(slot) === slotKey(s) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
                <span>{fmtT(s.startAt)} - {fmtT(s.endAt)}</span>
                <span className="text-[11px] font-normal opacity-80">{mins(s).toLocaleString("ar-SA")} دقيقة</span>
              </button>
            ))}
          </div>
        ))}
      <p className="text-xs text-muted-foreground">يعيّن مصور معتمد يغطي موقع نشاطك تلقائيا بعد اختيار الموعد.</p>
      {pay.isError && <ErrorBox error={pay.error} />}
      {walletPay.isError && !marker.value && <ErrorBox error={new Error(`لم يتم الدفع من المحفظة: ${walletErrText(walletPay.error)}. لم يتم التحويل للدفع بالبطاقة.`)} />}
      {walletDone && <Notice tone="ok"><span data-testid="text-wallet-booking-success">{walletDone}</span></Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-xl border border-border p-3">
          <p className="text-sm font-bold">البطاقة عبر ميسر</p>
          <button className={`${btnCls} w-full`} disabled={!pickable || !target || !slot || !packageId || anyPending} onClick={() => { setWalletDone(null); pay.mutate(); }} data-testid="button-checkout">
            {pay.isPending ? "جار التحويل إلى الدفع" : `الدفع عبر بوابة الدفع${pkg ? ` (${sar(pkg.priceHalalas)})` : ""}`}
          </button>
          <p className="text-xs text-muted-foreground">يتم حجز الموعد لمدة ١٥ دقيقة حتى إتمام الدفع في صفحة الدفع الآمنة.</p>
        </div>
        <div className="space-y-1.5 rounded-xl border border-[#8C6246]/30 bg-[#8C6246]/[0.04] p-3">
          <p className="text-sm font-bold">رصيد المحفظة <span className="font-normal text-muted-foreground">({wallet.data ? sar(balance) : "…"})</span></p>
          <button className={`${btnCls} w-full`} disabled={!cat.enabled || !target || !slot || !packageId || !walletCovers || anyPending} onClick={() => { if (lock.current) return; lock.current = true; setWalletDone(null); walletPay.mutate(); }} data-testid="button-wallet-pay">
            {walletPay.isPending ? "جار الدفع من المحفظة" : `الدفع من المحفظة${pkg ? ` (${sar(pkg.priceHalalas)})` : ""}`}
          </button>
          <p className="text-xs text-muted-foreground">{pkg && wallet.data && !walletCovers ? `الرصيد لا يغطي كامل السعر؛ ينقصك ${sar(pkg.priceHalalas - balance)}. لا يمكن الجمع بين المحفظة والبطاقة.` : "يجب أن يغطي الرصيد كامل سعر الباقة. لا يتم الجمع بين المحفظة والبطاقة."}</p>
        </div>
      </div>
    </section>
  );
}

export default function PhotographyOwner() {
  const ownerId = useOwnerId();
  const marker = useBookingWalletMarker(ownerId);
  const cat = useQuery({ queryKey: CK, queryFn: () => call<Catalog>("/photography/catalog"), refetchInterval: 30000 });
  const bk = useQuery({ queryKey: BK, queryFn: () => call<{ bookings: Booking[] }>("/photography/bookings"), refetchInterval: 30000 });
  return (
    <div className="space-y-5" dir="rtl" data-testid="photography-owner">
      <h2 className="text-xl font-bold">التصوير الاحترافي</h2>
      <ConfirmResult />
      <WalletBookingResume marker={marker} />
      <OwnerWalletPanel />
      {cat.isLoading ? <Skel /> : cat.isError || !cat.data ? <ErrorBox error={cat.error} onRetry={() => cat.refetch()} /> :
        !cat.data.enabled ? (
          <div className={`${cardCls} text-center`} data-testid="photography-coming-soon">
            <p className="text-2xl font-bold">قريباً</p>
            <p className="mt-1 text-sm text-muted-foreground">خدمة التصوير الاحترافي غير متاحة حاليا.</p>
          </div>
        ) : cat.data.properties.length + cat.data.services.length === 0 ? <Empty title="لا توجد أنشطة مؤهلة للتصوير" text="تأكد من وجود عقار أو خدمة معتمدة ونشطة ومن اكتمال بيانات موقعها." /> :
          cat.data.packages.length === 0 ? <Empty title="لا تتوفر باقات تصوير حاليا" /> : <Booker cat={cat.data} marker={marker} />}
      {(cat.data?.enabled || (bk.data?.bookings.length ?? 0) > 0) && (
        <section className="space-y-3">
          <h3 className="font-bold">حجوزاتي</h3>
          {bk.isLoading ? <Skel n={2} /> : bk.isError ? <ErrorBox error={bk.error} onRetry={() => bk.refetch()} /> :
            (bk.data?.bookings ?? []).length === 0 ? <Empty title="لا توجد حجوزات تصوير" /> :
              bk.data!.bookings.map((b) => (
                <div key={b.id} className={`${cardCls} space-y-3 ${b.assignmentStatus === "needs_review" ? "border-amber-400" : ""}`} data-testid={`card-booking-${b.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-bold">{b.packageName} - {b.propertyName}</p><p className="text-sm text-muted-foreground">{b.assignmentStatus === "needs_review" ? "جار تعيين مصور" : b.photographerName} - {fmtDT(b.startAt)} إلى {fmtT(b.endAt)}</p></div>
                    <div className="flex flex-col items-start gap-1"><div className="flex flex-wrap gap-1"><StatusPill s={b.deliveredAt ? "completed" : b.status} /><AssignmentBadge b={b} /></div><p className="text-sm">{sar(b.priceHalalas)}{b.paymentMethod ? ` - ${PAY_METHOD_AR[b.paymentMethod]}` : ""}</p></div>
                  </div>
                  {(b.financialStatus && b.financialStatus !== "paid" || (b.refunds?.length ?? 0) > 0) && (
                    <div className={`space-y-1.5 rounded-xl border p-3 text-sm ${b.financialStatus === "refund_failed" ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"}`} data-testid={`refunds-booking-${b.id}`}>
                      <p className="font-bold">{b.financialStatus ? FIN_STATUS_AR[b.financialStatus] : "الاستردادات"}{(b.refundedHalalas ?? 0) > 0 && <span className="font-normal"> - المسترد {sar(b.refundedHalalas!)} من {sar(b.priceHalalas)}</span>}</p>
                      {(b.refunds ?? []).map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-xs" data-testid={`row-owner-refund-${r.id}`}>
                          <span>{sar(r.amountHalalas)} {DEST_AR[r.destination]} - {fmtDT(r.createdAt)}</span>
                          <RefundStatusPill s={r.status} />
                        </div>
                      ))}
                    </div>
                  )}
                  {b.assignmentStatus === "needs_review" && <Notice tone="warn"><span data-testid={`notice-needs-review-${b.id}`}>حجزك مدفوع ومؤكد، ونعمل بشكل عاجل على تعيين مصور بديل لنفس الموعد. لا يلزمك أي إجراء أو دفع إضافي، وسيظهر اسم المصور هنا فور التعيين.</span></Notice>}
                  {b.deliveredAt && b.status === "completed" && b.assignmentStatus !== "needs_review" && <OwnerReview b={b} invalidateKey={BK} />}
                </div>
              ))}
        </section>
      )}
    </div>
  );
}
