import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Profile = { username: string; email: string; mobile: string };
async function requestProfile(method = "GET", body?: unknown) {
  const response = await fetch(`${BASE}/api/admin/profile`, {
    method, credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "تعذر تحديث إعدادات الحساب.");
  return data;
}

export function AdminProfile({ onClose }: { onClose: () => void }) {
  const query = useQuery<Profile>({ queryKey: ["admin", "profile"], queryFn: () => requestProfile(), staleTime: 0 });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent dir="rtl" className="max-w-lg border-slate-700 bg-slate-900 text-slate-100">
      <DialogHeader><DialogTitle className="text-right">إعدادات حساب المدير العام</DialogTitle></DialogHeader>
      {query.isLoading ? <p>جارٍ تحميل بيانات الحساب...</p> : query.isError
        ? <p role="alert" className="text-red-300">{query.error.message}</p>
        : query.data && <ProfileForm profile={query.data} onClose={onClose} />}
    </DialogContent>
  </Dialog>;
}

function ProfileForm({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [email, setEmail] = useState(profile.email);
  const [mobile, setMobile] = useState(profile.mobile);
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => requestProfile("PATCH", { email: email.trim(), mobile, currentPassword: password }),
    onSuccess: async () => {
      setPassword("");
      await qc.invalidateQueries({ queryKey: ["admin", "profile"] });
      toast({ title: "تم حفظ بيانات حساب المدير العام بنجاح" });
      onClose();
    },
  });
  const inputClass = "mt-2 h-11 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-slate-100";
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
    <p className="text-sm text-slate-300">اسم المستخدم: <b dir="ltr">{profile.username}</b></p>
    <p className="text-sm leading-6 text-slate-300">يُرسل رابط استعادة كلمة المرور إلى بريدك المسجل هنا. يلزم إدخال كلمة المرور الحالية لحماية تغيير بيانات الاستعادة.</p>
    <label className="block text-sm font-bold">البريد الإلكتروني الشخصي
      <input aria-label="البريد الإلكتروني الشخصي" required type="email" dir="ltr" autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
    </label>
    <label className="block text-sm font-bold">رقم الجوال
      <input aria-label="رقم الجوال" aria-describedby="admin-mobile-help" required type="tel" autoComplete="tel-national" inputMode="numeric" pattern="05[0-9]{8}" dir="rtl" maxLength={10} placeholder="مثال: ٠٥١٢٣٤٥٦٧٨" title="أدخل رقم جوال سعودي من عشرة أرقام يبدأ بصفر ثم خمسة" value={mobile} onInvalid={e => e.currentTarget.setCustomValidity("أدخل رقم جوال سعودي صحيحاً من عشرة أرقام يبدأ بصفر ثم خمسة.")} onChange={e => {
        e.currentTarget.setCustomValidity("");
        setMobile(e.target.value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) >= 1776 ? c.charCodeAt(0) - 1776 : c.charCodeAt(0) - 1632)).replace(/\D/g, "").slice(0, 10));
      }} className={`${inputClass} text-right font-[inherit]`} />
      <span id="admin-mobile-help" className="mt-2 block text-sm font-normal leading-6 text-slate-300">أدخل عشرة أرقام تبدأ بـ ٠٥، دون رمز الدولة. يمكنك استخدام الأرقام العربية أو الإنجليزية.</span>
    </label>
    <label className="block text-sm font-bold">كلمة المرور الحالية
      <input aria-label="كلمة المرور الحالية" required type="password" autoComplete="current-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
    </label>
    <p className="text-sm leading-6 text-slate-300">استعادة حساب المدير العام مخصصة لبريده الشخصي المسجل فقط، ولا تُحوّل إلى بريد طوارئ أو بريد موظف آخر. احفظ بريداً صحيحاً يمكنك الوصول إليه.</p>
    {save.isError && <p role="alert" className="text-sm text-red-300">{save.error.message}</p>}
    <button disabled={save.isPending} className="w-full rounded-lg bg-amber-500 py-3 font-bold text-slate-950 disabled:opacity-50">{save.isPending ? "جارٍ الحفظ..." : "حفظ بيانات الحساب"}</button>
  </form>;
}
