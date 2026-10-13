import { useState } from "react";
import { Camera, Building2, ShieldCheck, Users, LockKeyhole } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export interface LoginRole {
  key: string;
  role: "owner" | "photographer" | "admin" | "staff";
  label: string;
  requiresPassword: boolean;
}
const icons = { owner: Building2, photographer: Camera, admin: ShieldCheck, staff: Users };
export default function LoginRoleSelector({ roles, onChoose, onClose }: {
  roles: LoginRole[]; onChoose: (role: LoginRole, password?: string) => Promise<void>; onClose: () => void;
}) {
  const [selected, setSelected] = useState<LoginRole | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(role: LoginRole) {
    if (role.requiresPassword && selected?.key !== role.key) { setSelected(role); setPassword(""); setError(""); return; }
    setBusy(true); setError("");
    try { await onChoose(role, role.requiresPassword ? password : undefined); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذّر تسجيل الدخول"); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent dir="rtl" className="max-h-[90dvh] max-w-md overflow-y-auto text-right">
      <DialogHeader>
        <DialogTitle>بأي صفة تريد تسجيل الدخول اليوم؟</DialogTitle>
        <DialogDescription>اختر اللوحة المطلوبة. لكل دور صلاحياته وجلسة دخوله المستقلة.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        {roles.map(role => {
          const Icon = icons[role.role];
          return <button type="button" key={role.key} disabled={busy} onClick={() => {
            if (role.requiresPassword) { setSelected(role); setError(""); if (selected?.key !== role.key) setPassword(""); }
            else void choose(role);
          }}
            data-testid={`button-login-role-${role.role}`}
            className={`flex w-full items-center gap-3 rounded-xl border p-4 text-right disabled:opacity-50 ${selected?.key === role.key ? "border-[#8C6246] bg-[#F4EFEA]" : "border-border hover:bg-muted"}`}>
            <Icon className="h-5 w-5 text-[#8C6246]" />
            <span className="flex-1 font-semibold">{role.label}</span>
            {role.requiresPassword && <LockKeyhole className="h-4 w-4 text-muted-foreground" aria-label="يتطلب كلمة مرور الدور" />}
          </button>;
        })}
      </div>
      {selected?.requiresPassword && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void choose(selected); }}>
        <label className="block text-sm font-semibold" htmlFor="role-password">كلمة المرور الخاصة بـ{selected.label}</label>
        <input id="role-password" type="password" autoComplete="current-password" required autoFocus disabled={busy} value={password}
          onChange={e => setPassword(e.target.value)} data-testid="input-role-password"
          className="w-full rounded-xl border border-border px-3 py-2" />
        <button type="submit" disabled={busy || !password} className="w-full rounded-xl bg-[#8C6246] py-3 font-semibold text-white disabled:opacity-50" data-testid="button-confirm-login-role">
          {busy ? "جارٍ تسجيل الدخول…" : "دخول"}
        </button>
      </form>}
      {busy && !selected?.requiresPassword && <p className="text-sm text-muted-foreground" role="status">جارٍ تسجيل الدخول…</p>}
      {error && <p className="text-sm text-destructive" role="alert" data-testid="text-role-login-error">{error}</p>}
    </DialogContent>
  </Dialog>;
}
