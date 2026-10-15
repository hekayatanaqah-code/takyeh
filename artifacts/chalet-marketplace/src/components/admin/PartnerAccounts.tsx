import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Partner = { id: number; kind: "owner" | "photographer"; name: string; phone: string; email: string; canResetPassword?: boolean };
async function call(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${BASE}/api/admin/partner-accounts${path}`, {
    method, credentials: "include",
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "تعذر حفظ التعديل");
  return data;
}
const fieldClass = "bg-slate-800 border-slate-600 text-white";

export function PartnerAccountActions({ partner }: { partner: Partner }) {
  const [mode, setMode] = useState<"edit" | "password" | null>(null);
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [email, setEmail] = useState("");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const client = useQueryClient();
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: async () => {
      if (mode === "password" && password !== confirm) throw new Error("كلمتا المرور غير متطابقتين");
      return call(`/${partner.kind}/${partner.id}${mode === "password" ? "/password" : ""}`,
        mode === "password" ? "POST" : "PATCH", mode === "password" ? { password } : { name, phone, email });
    },
    onSuccess: () => {
      setPassword(""); setConfirm(""); setMode(null);
      void client.invalidateQueries({ queryKey: ["admin", "owners"] });
      void client.invalidateQueries({ queryKey: ["admin", "partner-photographers"] });
      void client.invalidateQueries({ queryKey: ["ph-admin"] });
      toast({ title: "تم الحفظ", description: mode === "password" ? "تم تعيين كلمة المرور وإنهاء جلسات الدور المستهدف." : "تم تحديث بيانات الحساب." });
    },
  });
  function open(next: "edit" | "password") {
    setName(partner.name); setPhone(partner.phone); setEmail(partner.email || "");
    setPassword(""); setConfirm(""); save.reset(); setMode(next);
  }
  return <>
    <Button type="button" variant="outline" size="sm" className="h-8 border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
      data-testid={`button-edit-partner-${partner.kind}-${partner.id}`} onClick={() => open("edit")}>تعديل المستخدم</Button>
    <Button type="button" variant="outline" size="sm" className="h-8 border-amber-800 bg-slate-800 text-amber-300 hover:bg-slate-700"
      disabled={partner.canResetPassword === false}
      title={partner.canResetPassword === false ? "يجب إكمال التسجيل وقبول العقد أولاً" : undefined}
      data-testid={`button-reset-partner-${partner.kind}-${partner.id}`} onClick={() => open("password")}>إعادة تعيين كلمة المرور</Button>
    <Dialog open={mode !== null} onOpenChange={open => { if (!open && !save.isPending) { setMode(null); setPassword(""); setConfirm(""); } }}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto border-slate-700 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>{mode === "password" ? "إعادة تعيين كلمة المرور" : "تعديل المستخدم"}</DialogTitle>
          <DialogDescription className="text-slate-400">{partner.name} — {partner.kind === "owner" ? "حساب المالك" : "حساب المصور"} — معرّف الحساب {partner.id.toLocaleString("ar-SA")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
          <fieldset className="space-y-4" disabled={save.isPending}>
          {mode === "password" ? <>
            <p className="rounded-lg bg-amber-950/40 p-3 text-xs leading-6 text-amber-200">
              تُحفظ كلمة المرور الجديدة فوراً وتُنهي جلسات هذا الدور فقط. لن تتغير كلمة مرور أي دور آخر يشارك الجوال أو البريد.
              {partner.kind === "owner" && " تُعد هذه العملية استعادة إدارية للحساب وتُمكّن الدخول بكلمة المرور، دون تغيير اعتماد العقارات أو الخدمات."}
            </p>
            <label className="block space-y-2"><span>كلمة المرور الجديدة</span>
              <Input className={fieldClass} type="password" autoComplete="new-password" required minLength={10} maxLength={72}
                value={password} onChange={event => setPassword(event.target.value)} data-testid="input-admin-new-password" /></label>
            <label className="block space-y-2"><span>تأكيد كلمة المرور</span>
              <Input className={fieldClass} type="password" autoComplete="new-password" required minLength={10} maxLength={72}
                value={confirm} onChange={event => setConfirm(event.target.value)} data-testid="input-admin-confirm-password" /></label>
            <p className="text-xs text-slate-400">١٠ أحرف على الأقل. لا تُعرض كلمة المرور الحالية ولا تُرسل في رسائل تلقائية.</p>
          </> : <>
            <label className="block space-y-2"><span>الاسم</span><Input className={fieldClass} value={name} required minLength={2} maxLength={120} onChange={event => setName(event.target.value)} data-testid="input-admin-partner-name" /></label>
            <label className="block space-y-2"><span>رقم الجوال</span><Input className={fieldClass} value={phone} required inputMode="tel" dir="ltr" data-no-arabic onChange={event => setPhone(event.target.value)} data-testid="input-admin-partner-phone" /></label>
            <label className="block space-y-2"><span>البريد الإلكتروني (اختياري)</span><Input className={fieldClass} value={email} type="email" dir="ltr" data-no-arabic maxLength={254} onChange={event => setEmail(event.target.value)} data-testid="input-admin-partner-email" /></label>
            <p className="text-xs text-slate-400">هذا التعديل خاص بالدور المحدد، ولا يدمج الحسابات المرتبطة ببيانات تواصل متشابهة.</p>
          </>}
          {save.isError && <p role="alert" className="text-sm text-red-300">{save.error.message}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending} className="bg-amber-700 hover:bg-amber-600" data-testid="button-save-partner-account">{save.isPending ? "جارٍ الحفظ..." : "حفظ"}</Button>
            <Button type="button" variant="outline" className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700" disabled={save.isPending} onClick={() => { setMode(null); setPassword(""); setConfirm(""); }}>إلغاء</Button>
          </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

export function PhotographerAccounts() {
  const [search, setSearch] = useState("");
  const query = useQuery<Array<Omit<Partner, "kind"> & { status: string }>>({
    queryKey: ["admin", "partner-photographers"], queryFn: () => call("/photographers"), refetchInterval: 30000,
  });
  const rows = (query.data || []).filter(row => `${row.name} ${row.phone} ${row.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section dir="rtl" className="space-y-4">
    <h2 className="text-xl font-bold text-white">إدارة حسابات المصورين</h2>
    <Input className={`${fieldClass} max-w-md`} placeholder="بحث بالاسم أو الجوال أو البريد" value={search} onChange={event => setSearch(event.target.value)} />
    {query.isLoading ? <p className="text-slate-400">جارٍ التحميل...</p> : query.isError ?
      <div role="alert" className="text-red-300">{query.error.message} <button onClick={() => void query.refetch()}>إعادة المحاولة</button></div> :
      rows.length === 0 ? <p className="text-slate-400">لا توجد حسابات مطابقة.</p> :
      rows.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div><h3 className="font-bold text-white">{row.name}</h3><p className="text-sm text-slate-400" dir="ltr">{row.phone} {row.email && ` · ${row.email}`}</p></div>
        <div className="flex flex-wrap gap-2"><PartnerAccountActions partner={{ ...row, kind: "photographer" }} /></div>
      </article>)}
  </section>;
}
