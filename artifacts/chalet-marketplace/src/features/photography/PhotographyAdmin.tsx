import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toAr, whatsappDigits } from "@/lib/utils";
import { sanitizeInvitePhone, validInvitePhone } from "@/lib/photography-invite-phone";
import { call, ORIGIN, sar, fmtDT, Field, inputCls, btnCls, ghostCls, cardCls, Skel, ErrorBox, Empty, Notice, StatusPill, GeoPicker, geoError, useCopy, AvailabilityEditor, availabilityError, type Interval, type Pkg, type Photographer, type Booking, type Geo } from "./shared";
import { ContractAdmin, TransfersPanel, formatIban } from "./finance";
import { PhotographersTable } from "./PhotographersTable";
import { UpperTabs, TabPanel } from "./portalWidgets";

type ATab = "photographers" | "bookings" | "settings";
const A_TABS = [["photographers", "المصورون وطلبات الانضمام"], ["bookings", "الحجوزات والجلسات"], ["settings", "إعدادات الخدمة والباقات"]] as const;

interface AdminData {
  enabled: boolean; readiness: { payment: boolean; whatsapp: boolean };
  packages: Pkg[]; photographers: Photographer[]; bookings: Booking[]; deliveries: unknown[];
}
interface InviteRes { invitePath: string; expiresAt: string; message: string; whatsappUrl: string; delivery: { status: string; error?: string } }
const KEY = ["ph-admin"];

function PackageForm({ pkg, onDone }: { pkg?: Pkg; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(pkg?.name ?? "");
  const [price, setPrice] = useState(pkg ? String(pkg.priceHalalas / 100) : "");
  const [pct, setPct] = useState(pkg ? String(pkg.platformPercent) : "");
  const [active, setActive] = useState(pkg?.active ?? true);
  const m = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), priceHalalas: Math.round(Number(price) * 100), platformPercent: Number(pct), active };
      return pkg ? call(`/admin/photography/packages/${pkg.id}`, "PATCH", data) : call("/admin/photography/packages", "POST", data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); onDone(); },
  });
  const bad = !name.trim() || !(Number(price) > 0) || pct === "" || Number(pct) < 0 || Number(pct) > 100;
  return (
    <form className={`${cardCls} space-y-3`} onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="اسم الباقة"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-package-name" /></Field>
        <Field label="السعر (ر.س)"><input type="number" min="0" step="0.01" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-package-price" /></Field>
        <Field label="نسبة المنصة %"><input type="number" min="0" max="100" step="0.1" className={inputCls} value={pct} onChange={(e) => setPct(e.target.value)} data-testid="input-package-percent" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> الباقة مفعلة</label>
      {m.isError && <ErrorBox error={m.error} />}
      <div className="flex gap-2">
        <button className={btnCls} disabled={bad || m.isPending} data-testid="button-save-package">{m.isPending ? "جار الحفظ" : "حفظ الباقة"}</button>
        <button type="button" className={ghostCls} onClick={onDone}>إلغاء</button>
      </div>
    </form>
  );
}

function InviteBox({ ready }: { ready: boolean }) {
  const qc = useQueryClient();
  const { copy, done } = useCopy();
  const [name, setName] = useState(""); const [wa, setWa] = useState(""); const [auto, setAuto] = useState(false);
  const [waTouched, setWaTouched] = useState(false);
  const phoneValid = validInvitePhone(wa);
  const phoneError = (waTouched || wa.length === 10) && !phoneValid;
  const m = useMutation({
    mutationFn: () => {
      if (!phoneValid) throw new Error("أدخل رقم واتساب من ١٠ أرقام يبدأ بـ ٠٥");
      return call<InviteRes>("/admin/photography/invites", "POST", { name: name.trim(), whatsapp: wa, sendAutomatically: auto && ready, origin: ORIGIN() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const r = m.data; const full = r ? ORIGIN() + r.invitePath : "";
  return (
    <section className={`${cardCls} space-y-3`}>
      <h3 className="font-bold">دعوة مصور</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الاسم"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-invite-name" /></Field>
        <Field label="رقم الواتساب" hint="رقم جوال سعودي يبدأ بـ ٠٥، مكوّن من ١٠ أرقام">
          <input lang="ar" dir="ltr" type="tel" inputMode="numeric" placeholder="٠٥١٢٣٤٥٦٧٨"
            minLength={10} maxLength={10} pattern="٠٥[٠-٩]{8}" required
            className={`${inputCls} placeholder:text-slate-300 placeholder:opacity-100`}
            value={toAr(wa)} onChange={(e) => setWa(sanitizeInvitePhone(e.target.value))}
            onBlur={() => setWaTouched(true)}
            onPaste={(e) => {
              e.preventDefault();
              const start = e.currentTarget.selectionStart ?? wa.length;
              const end = e.currentTarget.selectionEnd ?? start;
              const pasted = whatsappDigits(e.clipboardData.getData("text"));
              setWa(sanitizeInvitePhone(wa.slice(0, start) + pasted + wa.slice(end)));
            }}
            aria-invalid={phoneError} aria-describedby={phoneError ? "invite-whatsapp-error" : undefined}
            data-testid="input-invite-whatsapp" />
          {phoneError && <p id="invite-whatsapp-error" role="alert" className="text-xs text-red-400">أدخل ١٠ أرقام تبدأ بـ ٠٥، دون حروف أو رموز.</p>}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!ready} checked={auto && ready} onChange={(e) => setAuto(e.target.checked)} /> إرسال تلقائي عبر واتساب {!ready && <span className="text-muted-foreground">(غير جاهز، استخدم المشاركة اليدوية)</span>}</label>
      <button className={btnCls} disabled={!name.trim() || !phoneValid || m.isPending} onClick={() => m.mutate()} data-testid="button-create-invite">{m.isPending ? "جار الإنشاء" : "إنشاء رابط الدعوة"}</button>
      {m.isError && <ErrorBox error={m.error} />}
      {r && (
        <div className="space-y-2">
          <Notice tone={r.delivery.status === "failed" || r.delivery.error ? "warn" : "ok"}>
            حالة الإرسال: {r.delivery.status}{r.delivery.error ? ` - ${r.delivery.error}` : ""}
          </Notice>
          <input readOnly dir="ltr" className={inputCls} value={full} onFocus={(e) => e.currentTarget.select()} data-testid="text-invite-link" />
          <p className="text-xs text-muted-foreground">ينتهي الرابط: {fmtDT(r.expiresAt)}</p>
          <div className="flex flex-wrap gap-2">
            <button className={ghostCls} onClick={() => copy(full)} data-testid="button-copy-invite">{done === full ? "تم النسخ" : "نسخ الرابط"}</button>
            <a className={ghostCls} href={r.whatsappUrl} target="_blank" rel="noreferrer" data-testid="link-whatsapp-invite">مشاركة عبر واتساب</a>
          </div>
        </div>
      )}
    </section>
  );
}

function ProfileEditor({ p }: { p: Photographer }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(p.name); const [bio, setBio] = useState(p.bio ?? "");
  const [mins, setMins] = useState(String(p.sessionMinutes)); const [av, setAv] = useState<Interval[]>(p.availability ?? []);
  const reset = () => { setName(p.name); setBio(p.bio ?? ""); setMins(String(p.sessionMinutes)); setAv(p.availability ?? []); };
  const m = useMutation({
    mutationFn: () => call(`/admin/photography/photographers/${p.id}/profile`, "PATCH", { name: name.trim(), bio: bio.trim(), sessionMinutes: Number(mins), availability: av }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); setEdit(false); },
  });
  if (!edit) return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">مدة الجلسة: {p.sessionMinutes} دقيقة - فترات التوفر: {p.availability?.length ?? 0}</p>
      <button type="button" className={ghostCls} onClick={() => { reset(); setEdit(true); }} data-testid={`button-edit-profile-${p.id}`}>تعديل البيانات والتقويم</button>
    </div>
  );
  const err = !name.trim() ? "الاسم مطلوب" : availabilityError(av, Number(mins));
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم المصور"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-profile-name" /></Field>
        <Field label="مدة الجلسة (دقيقة)"><input type="number" min="30" max="240" step="15" className={inputCls} value={mins} onChange={(e) => setMins(e.target.value)} data-testid="input-profile-minutes" /></Field>
      </div>
      <Field label="نبذة"><textarea className={inputCls} rows={2} value={bio} onChange={(e) => setBio(e.target.value)} data-testid="input-profile-bio" /></Field>
      <AvailabilityEditor value={av} onChange={setAv} />
      {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
      <div className="flex gap-2">
        <button type="button" className={btnCls} disabled={!!err || m.isPending} onClick={() => m.mutate()} data-testid="button-save-profile">{m.isPending ? "جار الحفظ" : "حفظ البيانات"}</button>
        <button type="button" className={ghostCls} onClick={() => setEdit(false)}>إلغاء</button>
      </div>
    </div>
  );
}

function ReviewPanel({ p, onClose }: { p: Photographer; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(p.adminNote ?? "");
  const [geo, setGeo] = useState<Geo>({ regionId: p.regionId, cityId: p.cityId, districtIds: p.districtIds ?? [], allDistricts: p.allDistricts });
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (status: string) => call(`/admin/photography/photographers/${p.id}`, "PATCH", { status, adminNote: note, ...geo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); onClose(); },
  });
  const act = (s: string) => {
    setErr(null);
    if (s === "approved") { const e = geoError(geo); if (e) return setErr(e); }
    if ((s === "rejected" || s === "suspended") && !note.trim()) return setErr("اكتب ملاحظة توضح السبب");
    m.mutate(s);
  };
  return (
    <div className="space-y-3" data-testid={`card-photographer-${p.id}`}>
      {p.bio && <p className="text-sm">{p.bio}</p>}
      <div className="grid gap-2 rounded-xl border border-border p-3 text-sm sm:grid-cols-2" data-testid={`info-bank-${p.id}`}>
        <p>البنك: <span className="font-semibold">{p.bankName || "غير مسجل"}</span></p>
        <p>الآيبان: <span dir="ltr" className="font-mono">{p.iban ? formatIban(p.iban) : "غير مسجل"}</span></p>
        <p className="sm:col-span-2">العقد: {p.contractVersion ? `وافق على الإصدار ${p.contractVersion.toLocaleString("ar-SA")}${p.contractAcceptedAt ? ` في ${fmtDT(p.contractAcceptedAt)}` : ""}` : "لا توجد موافقة مسجلة"}</p>
      </div>
      <TransfersPanel id={p.id} />
      <ProfileEditor p={p} />
      <GeoPicker value={geo} onChange={setGeo} />
      <Field label="ملاحظة الإدارة"><textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-admin-note" /></Field>
      {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
      <div className="flex flex-wrap gap-2">
        <button className={btnCls} disabled={m.isPending} onClick={() => act("approved")} data-testid="button-approve">اعتماد</button>
        <button className={ghostCls} disabled={m.isPending} onClick={() => act("rejected")} data-testid="button-reject">رفض</button>
        <button className={ghostCls} disabled={m.isPending} onClick={() => act("suspended")} data-testid="button-suspend">إيقاف</button>
      </div>
    </div>
  );
}

const AdminTabs = UpperTabs<ATab>;
export default function PhotographyAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => call<AdminData>("/admin/photography"), refetchInterval: 30000 });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => call("/admin/photography/settings", "PATCH", { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["admin-owner-services"] });
      qc.invalidateQueries({ queryKey: ["owner-services"] });
      qc.invalidateQueries({ queryKey: ["ph-owner-catalog"] });
    },
  });
  const [editing, setEditing] = useState<Pkg | "new" | null>(null);
  const [tab, setTab] = useState<ATab>("photographers");
  const [contractOpen, setContractOpen] = useState(false);
  if (q.isLoading) return <Skel />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-6" dir="rtl" data-testid="photography-admin">
      <div><h2 className="text-lg font-bold">التصوير الاحترافي</h2><p className="text-sm text-muted-foreground">الخدمة {d.enabled ? "متاحة للطلب" : "متوقفة عن استقبال طلبات جديدة"}</p></div>
      <AdminTabs id="pha" tabs={A_TABS} active={tab} onChange={setTab} />
      <TabPanel id="pha" k="photographers" active={tab}>
      <InviteBox ready={d.readiness.whatsapp} />
      <section className="space-y-3">
        <h3 className="font-bold">المصورون وطلبات الانضمام</h3>
        <PhotographersTable rows={d.photographers} renderPanel={(p, close) => <ReviewPanel p={p} onClose={close} />} />
      </section>
      </TabPanel>
      <TabPanel id="pha" k="bookings" active={tab}>
      <section className="space-y-3">
        <h3 className="font-bold">الحجوزات والجلسات</h3>
        {d.bookings.length === 0 ? <Empty title="لا توجد حجوزات" /> : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm"><thead className="bg-muted text-start"><tr>{["العقار / الخدمة", "المالك", "المصور", "الباقة", "الموعد", "المبلغ", "العمولة", "الحالة"].map((h) => <th key={h} className="p-3 text-start">{h}</th>)}</tr></thead>
              <tbody>{d.bookings.map((b) => (
                <tr key={b.id} className="border-t border-border"><td className="p-3">{b.propertyName}</td><td className="p-3" data-testid={`text-booking-owner-${b.id}`}>{b.ownerName?.trim() || <span className="text-muted-foreground">غير مسجل</span>}</td><td className="p-3">{b.photographerName}</td><td className="p-3">{b.packageName}</td>
                  <td className="p-3">{fmtDT(b.startAt)}</td><td className="p-3">{sar(b.priceHalalas)}</td><td className="p-3">{sar(b.commissionHalalas)}</td><td className="p-3"><StatusPill s={b.status} /></td></tr>
              ))}</tbody></table>
          </div>
        )}
      </section>
      </TabPanel>
      <TabPanel id="pha" k="settings" active={tab}>
      <section className={`${cardCls} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h3 className="font-bold">حالة الخدمة والجاهزية</h3>
          <p className="text-sm text-muted-foreground">الخدمة {d.enabled ? "متاحة للطلب" : "متوقفة عن استقبال طلبات جديدة"}</p>
          <p className="mt-1 text-xs">الدفع: {d.readiness.payment ? "جاهز" : "غير جاهز"} - واتساب: {d.readiness.whatsapp ? "جاهز" : "غير جاهز"}</p>
        </div>
        <button className={d.enabled ? ghostCls : btnCls} disabled={toggle.isPending} onClick={() => toggle.mutate(!d.enabled)} data-testid="button-toggle-photography">
          {d.enabled ? "إيقاف الخدمة" : "تفعيل الخدمة"}
        </button>
        {toggle.isError && <div className="w-full"><ErrorBox error={toggle.error} /></div>}
      </section>

      <section className={`${cardCls} space-y-3`} data-testid="section-contract-admin">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-bold">عقد المصورين</h3><p className="text-xs text-muted-foreground">النسخة التي يوافق عليها المصور عند الانضمام.</p></div>
          <button type="button" className={contractOpen ? ghostCls : btnCls} aria-expanded={contractOpen} aria-controls="contract-admin-editor" onClick={() => setContractOpen((o) => !o)} data-testid="button-manage-contract">{contractOpen ? "إغلاق والعودة" : "إدارة عقد المصورين"}</button>
        </div>
        {contractOpen && <div id="contract-admin-editor" className="space-y-3 border-t border-border pt-3"><ContractAdmin /><button type="button" className={ghostCls} onClick={() => setContractOpen(false)} data-testid="button-close-contract">رجوع إلى الإعدادات</button></div>}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-bold">الباقات</h3>
          <button className={btnCls} onClick={() => setEditing("new")} data-testid="button-new-package">باقة جديدة</button></div>
        {editing && <PackageForm key={editing === "new" ? "n" : editing.id} pkg={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
        {d.packages.length === 0 ? <Empty title="لا توجد باقات" text="أنشئ باقة ليتمكن الملاك من الحجز." /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.packages.map((p) => (
              <div key={p.id} className={`${cardCls} flex items-center justify-between gap-3`} data-testid={`card-package-${p.id}`}>
                <div><p className="font-bold">{p.name}</p><p className="text-sm text-muted-foreground">{sar(p.priceHalalas)} - عمولة المنصة {p.platformPercent.toLocaleString("ar-SA")}٪</p></div>
                <div className="flex items-center gap-2"><StatusPill s={p.active ? "approved" : "suspended"} />
                  <button className={ghostCls} onClick={() => setEditing(p)}>تعديل</button></div>
              </div>
            ))}
          </div>
        )}
      </section>

      </TabPanel>
    </div>
  );
}
