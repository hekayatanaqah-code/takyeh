import { useRef, useState } from "react";
import { toAr, whatsappDigits } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { DurationSelect, WeeklyAvailability, BlockedDatesCalendar } from "./availabilityControls";
import { profileImageError } from "./imageRules";
import { call, sar, fmtDT, Field, inputCls, btnCls, ghostCls, cardCls, Skel, ErrorBox, Empty, Notice, StatusPill, GeoPicker, geoError, availabilityError, API, EXPERIENCE_AR, type ExperienceYears, type Photographer, type Booking, type Geo, type Interval } from "./shared";

interface Profile { bio: string; sessionMinutes: number; availability: Interval[]; experienceYears: ExperienceYears | ""; portfolioUrl: string; profileImagePath: string; blockedDates: string[] }
const emptyProfile: Profile = { bio: "", sessionMinutes: 90, availability: [], experienceYears: "", portfolioUrl: "", profileImagePath: "", blockedDates: [] };

/** 9665XXXXXXXX -> 05XXXXXXXX, then Eastern digits. */
export function waDisplay(w: string): string {
  const d = (w ?? "").replace(/\D/g, "");
  return toAr(d.startsWith("966") ? `0${d.slice(3)}` : d || w);
}

function ImageUpload({ value, onChange, inviteToken, onBusy }: { value: string; onChange: (v: string) => void; inviteToken?: string; onBusy: (b: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const setB = (b: boolean) => { setBusy(b); onBusy(b); };
  const pick = async (file: File | undefined) => {
    if (ref.current) ref.current.value = "";
    if (!file) return;
    const validationError = profileImageError(file);
    if (validationError) return setErr(validationError);
    setErr(null); setB(true);
    try {
      const u = await call<{ uploadURL: string; objectPath: string; uploadProof: string }>("/photography/profile-image/upload-url", "POST", { name: file.name, size: file.size, contentType: file.type, inviteToken });
      const r = await fetch(u.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!r.ok) throw new Error("تعذر رفع الصورة، حاول مرة أخرى");
      const c = await call<{ objectPath: string }>("/photography/profile-image/complete", "POST", { objectPath: u.objectPath, uploadProof: u.uploadProof, inviteToken });
      onChange(c.objectPath);
    } catch (e) { setErr(e instanceof Error ? e.message : "تعذر رفع الصورة"); } finally { setB(false); }
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">الصورة الشخصية / البروفايل <span className="font-normal text-muted-foreground">(اختياري)</span></p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted" data-testid="img-profile-preview">
          {value ? <img src={`${API}/storage${value}`} alt="الصورة الشخصية" className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">لا صورة</span>}
          {busy && <div className="absolute inset-0 animate-pulse bg-background/70" aria-hidden />}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} data-testid="input-profile-image" aria-label="اختر صورة" />
          <button type="button" className={ghostCls} disabled={busy} onClick={() => ref.current?.click()} data-testid="button-upload-image">{busy ? "جار الرفع" : value ? "استبدال الصورة" : "رفع صورة"}</button>
          {value && !busy && <button type="button" className={ghostCls} onClick={() => onChange("")} data-testid="button-remove-image">إزالة</button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">JPEG أو PNG أو WebP، حتى ٥ ميجابايت.</p>
      {err && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive" data-testid="text-image-error">{err}</p>}
    </div>
  );
}

function ProfileFields({ geo, setGeo, prof, setProf, inviteToken, onBusy }: { geo: Geo; setGeo: (g: Geo) => void; prof: Profile; setProf: React.Dispatch<React.SetStateAction<Profile>>; inviteToken?: string; onBusy: (b: boolean) => void }) {
  return (
    <div className="space-y-4">
      <ImageUpload value={prof.profileImagePath} onChange={(profileImagePath) => setProf(current => ({ ...current, profileImagePath }))} inviteToken={inviteToken} onBusy={onBusy} />
      <Field label="نبذة عنك"><textarea rows={3} className={inputCls} placeholder="اكتب نبذة مختصرة عن خبرتك ومعداتك في تصوير العقارات والأنشطة" value={prof.bio} onChange={(e) => setProf({ ...prof, bio: e.target.value })} data-testid="input-bio" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="سنوات الخبرة (اختياري)">
          <select className={inputCls} value={prof.experienceYears} onChange={(e) => setProf({ ...prof, experienceYears: e.target.value as ExperienceYears | "" })} data-testid="select-experience">
            <option value="">اختر</option>
            {(Object.keys(EXPERIENCE_AR) as ExperienceYears[]).map((k) => <option key={k} value={k}>{EXPERIENCE_AR[k]}</option>)}
          </select>
        </Field>
        <Field label="رابط معرض الأعمال / Portfolio (اختياري)" hint="رابط Behance أو Instagram أو موقعك الشخصي"><input dir="ltr" type="url" inputMode="url" placeholder="https://www.behance.net/..." className={inputCls} value={prof.portfolioUrl} onChange={(e) => setProf({ ...prof, portfolioUrl: e.target.value })} data-testid="input-portfolio" /></Field>
      </div>
      <GeoPicker value={geo} onChange={setGeo} />
      <DurationSelect value={prof.sessionMinutes} onChange={(sessionMinutes) => setProf((c) => ({ ...c, sessionMinutes }))} />
      <div><p className="mb-2 text-sm font-semibold">أوقات التوفر الأسبوعية</p><WeeklyAvailability value={prof.availability} onChange={(availability) => setProf((c) => ({ ...c, availability }))} /></div>
      <BlockedDatesCalendar value={prof.blockedDates} onChange={(blockedDates) => setProf((c) => ({ ...c, blockedDates }))} />
    </div>
  );
}
const urlError = (u: string) => { if (!u.trim()) return null; try { const x = new URL(u.trim()); return (x.protocol === "http:" || x.protocol === "https:") && !x.username && !x.password ? null : "أدخل رابطاً عاماً يبدأ بـ http أو https دون بيانات دخول"; } catch { return "رابط الأعمال غير صالح"; } };
const validate = (g: Geo, p: Profile) => geoError(g) ?? availabilityError(p.availability, p.sessionMinutes) ?? (p.bio.trim() ? null : "اكتب نبذة قصيرة") ?? urlError(p.portfolioUrl);
const payload = (p: Profile) => ({ ...p, portfolioUrl: p.portfolioUrl.trim(), blockedDates: [...new Set(p.blockedDates)].sort() });
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
  const [prof, setProf] = useState<Profile>(emptyProfile);
  const [uploading, setUploading] = useState(false);
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => call(`/photography/invites/${encodeURIComponent(token)}`, "POST", { ...payload(prof), ...geo, password: pw }),
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
        <Field label="رقم الواتساب"><input readOnly dir="ltr" className={inputCls} value={waDisplay(inv.data.whatsapp)} data-testid="text-invite-phone" /></Field>
      </div>
      <div className={cardCls}><ProfileFields geo={geo} setGeo={setGeo} prof={prof} setProf={setProf} inviteToken={token} onBusy={setUploading} /></div>
      <div className={`${cardCls} grid gap-3 sm:grid-cols-2`}>
        <Field label="كلمة المرور"><input type="password" autoComplete="new-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-password" /></Field>
        <Field label="تأكيد كلمة المرور"><input type="password" autoComplete="new-password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="input-password-confirm" /></Field>
      </div>
      {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
      <div className="flex justify-center pt-2">
        <button className={`${btnCls} min-h-14 w-full text-base font-bold`} disabled={m.isPending || uploading} onClick={submit} data-testid="button-submit-application">{m.isPending ? "جار الإرسال" : "إرسال الطلب"}</button>
      </div>
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
        <Field label="رقم الواتساب"><input dir="ltr" type="tel" inputMode="numeric" maxLength={15} placeholder="٠٥١٢٣٤٥٦٧٨" className={inputCls} value={toAr(wa)} onChange={(e) => setWa(whatsappDigits(e.target.value).slice(0, 15))} data-testid="input-login-whatsapp" /></Field>
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
  const [prof, setProf] = useState<Profile>({ bio: p.bio ?? "", sessionMinutes: p.sessionMinutes || 90, availability: p.availability ?? [], experienceYears: p.experienceYears ?? "", portfolioUrl: p.portfolioUrl ?? "", profileImagePath: p.profileImagePath ?? "", blockedDates: p.blockedDates ?? [] });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const geoChanged = geo.regionId !== p.regionId || geo.cityId !== p.cityId || geo.allDistricts !== p.allDistricts || [...geo.districtIds].sort().join() !== [...(p.districtIds ?? [])].sort().join();
  const m = useMutation({ mutationFn: () => call("/photography/portal", "PATCH", { ...payload(prof), ...geo }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ph-portal"] }) });
  return (
    <section className={`${cardCls} space-y-4`}>
      <h3 className="font-bold">ملفي</h3>
      <ProfileFields geo={geo} setGeo={setGeo} prof={prof} setProf={setProf} onBusy={setUploading} />
      {geoChanged && p.status === "approved" && <Notice tone="warn">تغيير منطقة التغطية يعيد ملفك إلى المراجعة قبل استقبال حجوزات جديدة.</Notice>}
      {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
      {m.isSuccess && <Notice tone="ok">تم حفظ التعديلات</Notice>}
      <button className={btnCls} disabled={m.isPending || uploading} data-testid="button-save-profile" onClick={() => { const e = validate(geo, prof); setErr(e); if (!e) m.mutate(); }}>{m.isPending ? "جار الحفظ" : "حفظ التعديلات"}</button>
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
        <div><p className="font-bold" data-testid="text-photographer-name">{p.name}</p><p dir="ltr" className="text-start text-xs text-muted-foreground" data-testid="text-photographer-whatsapp">{waDisplay(p.whatsapp)}</p></div>
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
      <ProfileEditor key={JSON.stringify([p.regionId, p.cityId, p.districtIds, p.bio, p.sessionMinutes, p.availability, p.experienceYears, p.portfolioUrl, p.profileImagePath, p.blockedDates])} p={p} />
    </Shell>
  );
}
