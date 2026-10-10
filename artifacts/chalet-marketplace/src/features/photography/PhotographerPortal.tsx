import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { call, sar, fmtDT, Field, inputCls, btnCls, ghostCls, cardCls, Skel, ErrorBox, Empty, Notice, StatusPill, GeoPicker, geoError, AvailabilityEditor, availabilityError, type Photographer, type Booking, type Geo, type Interval } from "./shared";

interface Profile { bio: string; sessionMinutes: number; availability: Interval[] }

function ProfileFields({ geo, setGeo, prof, setProf }: { geo: Geo; setGeo: (g: Geo) => void; prof: Profile; setProf: (p: Profile) => void }) {
  return (
    <div className="space-y-4">
      <Field label="نبذة عنك"><textarea rows={3} className={inputCls} value={prof.bio} onChange={(e) => setProf({ ...prof, bio: e.target.value })} data-testid="input-bio" /></Field>
      <GeoPicker value={geo} onChange={setGeo} />
      <Field label="مدة الجلسة (دقيقة، من ٣٠ إلى ٢٤٠)"><input type="number" min={30} max={240} className={inputCls} value={prof.sessionMinutes} onChange={(e) => setProf({ ...prof, sessionMinutes: Number(e.target.value) })} data-testid="input-session" /></Field>
      <div><p className="mb-2 text-sm font-semibold">أوقات التوفر الأسبوعية</p><AvailabilityEditor value={prof.availability} onChange={(availability) => setProf({ ...prof, availability })} /></div>
    </div>
  );
}
const validate = (g: Geo, p: Profile) => geoError(g) ?? availabilityError(p.availability, p.sessionMinutes) ?? (p.bio.trim() ? null : "اكتب نبذة قصيرة");
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div dir="rtl" className="mx-auto min-h-[100dvh] max-w-3xl space-y-5 bg-background px-4 py-8 text-foreground">
    <h1 className="text-2xl font-bold">بوابة مصوري تكية</h1>{children}
  </div>
);

export function PhotographerInvite() {
  const { token = "" } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const inv = useQuery({ queryKey: ["ph-invite", token], retry: false, queryFn: () => call<{ name: string; whatsapp: string; expiresAt: string }>(`/photography/invites/${encodeURIComponent(token)}`) });
  const [geo, setGeo] = useState<Geo>({ regionId: null, cityId: null, districtIds: [], allDistricts: false });
  const [prof, setProf] = useState<Profile>({ bio: "", sessionMinutes: 90, availability: [] });
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => call(`/photography/invites/${encodeURIComponent(token)}`, "POST", { ...prof, ...geo, password: pw }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ph-portal"] }); window.location.assign(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/photographer`); },
  });
  if (inv.isLoading) return <Shell><Skel /></Shell>;
  if (inv.isError || !inv.data) return <Shell><ErrorBox error={inv.error ?? new Error("رابط الدعوة غير صالح أو منتهي")} /></Shell>;
  const submit = () => {
    const e = validate(geo, prof) ?? (pw.length < 10 ? "كلمة المرور ١٠ أحرف على الأقل" : pw !== pw2 ? "كلمتا المرور غير متطابقتين" : null);
    setErr(e); if (!e) m.mutate();
  };
  return (
    <Shell>
      <p className="text-sm text-muted-foreground">أكمل ملفك لتتم مراجعته من الإدارة. الأوقات بتوقيت السعودية.</p>
      <div className={`${cardCls} grid gap-3 sm:grid-cols-2`}>
        <Field label="الاسم"><input readOnly className={inputCls} value={inv.data.name} data-testid="text-invite-name" /></Field>
        <Field label="رقم الواتساب"><input readOnly dir="ltr" className={inputCls} value={inv.data.whatsapp} data-testid="text-invite-phone" /></Field>
      </div>
      <div className={cardCls}><ProfileFields geo={geo} setGeo={setGeo} prof={prof} setProf={setProf} /></div>
      <div className={`${cardCls} grid gap-3 sm:grid-cols-2`}>
        <Field label="كلمة المرور"><input type="password" autoComplete="new-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-password" /></Field>
        <Field label="تأكيد كلمة المرور"><input type="password" autoComplete="new-password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="input-password-confirm" /></Field>
      </div>
      {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
      <button className={btnCls} disabled={m.isPending} onClick={submit} data-testid="button-submit-application">{m.isPending ? "جار الإرسال" : "إرسال الطلب"}</button>
    </Shell>
  );
}

function Login() {
  const qc = useQueryClient();
  const [wa, setWa] = useState(""); const [pw, setPw] = useState("");
  const m = useMutation({ mutationFn: () => call("/photography/portal/login", "POST", { whatsapp: wa.trim(), password: pw }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ph-portal"] }) });
  return (
    <Shell>
      <form className={`${cardCls} space-y-3`} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Field label="رقم الواتساب"><input dir="ltr" inputMode="tel" className={inputCls} value={wa} onChange={(e) => setWa(e.target.value)} data-testid="input-login-whatsapp" /></Field>
        <Field label="كلمة المرور"><input type="password" autoComplete="current-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-login-password" /></Field>
        {m.isError && <ErrorBox error={m.error} />}
        <button className={btnCls} disabled={!wa.trim() || !pw || m.isPending} data-testid="button-login">{m.isPending ? "جار الدخول" : "تسجيل الدخول"}</button>
      </form>
    </Shell>
  );
}

function ProfileEditor({ p }: { p: Photographer }) {
  const qc = useQueryClient();
  const [geo, setGeo] = useState<Geo>({ regionId: p.regionId, cityId: p.cityId, districtIds: p.districtIds ?? [], allDistricts: p.allDistricts });
  const [prof, setProf] = useState<Profile>({ bio: p.bio ?? "", sessionMinutes: p.sessionMinutes || 90, availability: p.availability ?? [] });
  const [err, setErr] = useState<string | null>(null);
  const geoChanged = geo.regionId !== p.regionId || geo.cityId !== p.cityId || geo.allDistricts !== p.allDistricts || [...geo.districtIds].sort().join() !== [...(p.districtIds ?? [])].sort().join();
  const m = useMutation({ mutationFn: () => call("/photography/portal", "PATCH", { ...prof, ...geo }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ph-portal"] }) });
  return (
    <section className={`${cardCls} space-y-4`}>
      <h3 className="font-bold">ملفي</h3>
      <ProfileFields geo={geo} setGeo={setGeo} prof={prof} setProf={setProf} />
      {geoChanged && p.status === "approved" && <Notice tone="warn">تغيير منطقة التغطية يعيد ملفك إلى المراجعة قبل استقبال حجوزات جديدة.</Notice>}
      {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
      {m.isSuccess && <Notice tone="ok">تم حفظ التعديلات</Notice>}
      <button className={btnCls} disabled={m.isPending} data-testid="button-save-profile" onClick={() => { const e = validate(geo, prof); setErr(e); if (!e) m.mutate(); }}>{m.isPending ? "جار الحفظ" : "حفظ التعديلات"}</button>
    </section>
  );
}

export default function PhotographerPortal() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ph-portal"], retry: false, refetchInterval: 30000, queryFn: () => call<{ photographer: Photographer; bookings: Booking[]; earnings: { totalHalalas: number; commissionHalalas: number; netHalalas: number } }>("/photography/portal") });
  const out = useMutation({ mutationFn: () => call("/photography/portal/logout", "POST"), onSuccess: () => { qc.removeQueries({ queryKey: ["ph-portal"] }); q.refetch(); } });
  if (q.isLoading) return <Shell><Skel /></Shell>;
  if (q.isError || !q.data) return <Login />;
  const { photographer: p, bookings, earnings } = q.data;
  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.endAt).getTime() >= now);
  const history = bookings.filter((b) => !upcoming.includes(b));
  return (
    <Shell>
      <div className={`${cardCls} flex flex-wrap items-center justify-between gap-3`}>
        <div><p className="font-bold" data-testid="text-photographer-name">{p.name}</p><p dir="ltr" className="text-start text-xs text-muted-foreground">{p.whatsapp}</p></div>
        <div className="flex items-center gap-2"><StatusPill s={p.status} /><button className={ghostCls} disabled={out.isPending} onClick={() => out.mutate()} data-testid="button-logout">خروج</button></div>
      </div>
      {p.status === "pending" && <Notice tone="warn">طلبك قيد المراجعة من الإدارة. لن تظهر للملاك حتى الاعتماد.</Notice>}
      {(p.status === "rejected" || p.status === "suspended") && <Notice tone="err">{p.status === "rejected" ? "تم رفض الطلب" : "تم إيقاف حسابك"}{p.adminNote ? `: ${p.adminNote}` : "."}</Notice>}
      {p.status === "approved" && p.adminNote && <Notice tone="ok">ملاحظة الإدارة: {p.adminNote}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[["إجمالي المبيعات", earnings.totalHalalas], ["عمولة المنصة", earnings.commissionHalalas], ["صافي أرباحك", earnings.netHalalas]].map(([l, v]) => (
          <div key={l as string} className={cardCls}><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-bold">{sar(v as number)}</p></div>
        ))}
      </div>
      <section className="space-y-3"><h3 className="font-bold">المواعيد القادمة</h3>
        {upcoming.length === 0 ? <Empty title="لا توجد مواعيد مؤكدة قادمة" /> : upcoming.map((b) => (
          <div key={b.id} className={cardCls} data-testid={`card-upcoming-${b.id}`}><p className="font-bold">{b.propertyName}</p><p className="text-sm text-muted-foreground">{b.packageName} - {fmtDT(b.startAt)} - صافيك {sar(b.photographerEarningsHalalas)}</p></div>
        ))}</section>
      <section className="space-y-3"><h3 className="font-bold">السجل</h3>
        {history.length === 0 ? <Empty title="لا يوجد سجل بعد" /> : history.map((b) => (
          <div key={b.id} className={`${cardCls} flex items-center justify-between gap-2`}><div><p className="font-bold">{b.propertyName}</p><p className="text-sm text-muted-foreground">{b.packageName} - {fmtDT(b.startAt)} - عمولة {sar(b.commissionHalalas)}</p></div><StatusPill s={b.status} /></div>
        ))}</section>
      <ProfileEditor key={JSON.stringify([p.regionId, p.cityId, p.districtIds, p.bio, p.sessionMinutes, p.availability])} p={p} />
    </Shell>
  );
}
