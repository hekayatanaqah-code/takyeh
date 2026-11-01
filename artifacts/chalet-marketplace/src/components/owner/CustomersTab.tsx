import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { getOwnerCrmProfile, type CrmCustomerSummary } from "@workspace/api-client-react";
import { CustomerNotes, type CustomerNotesHandle } from "@/components/owner/CustomerNotes";
import { CustomerDirectory } from "@/components/owner/CustomerDirectory";
import { User, Trash2, AlertTriangle, ChevronLeft, Edit2, Loader2 } from "lucide-react";
import { toAr, fromAr } from "@/lib/utils";
import { CustomerDate } from "@/components/owner/CustomerDate";
import { CustomerHistory } from "@/components/owner/CustomerHistory";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAdminFinance } from "@/components/owner/OwnerDashboardContexts";
import { apiFetch } from "@/components/owner/owner-api";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


/* ════════════════════════════════════════════════════════════════
   CRM — Customers Tab
   ════════════════════════════════════════════════════════════════ */
export function CustomersTab({ calendarPreference = "hijri" }: { calendarPreference?: "hijri" | "gregorian" }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { unit: repUnit } = useAdminFinance();
  const serviceScope = repUnit.type === "service";
  const scopedProviderId = serviceScope ? repUnit.id : null;
  const customerApiPath = (phone: string, suffix = "") =>
    serviceScope
      ? `/owner/service-clients/${encodeURIComponent(phone)}${suffix}?providerId=${scopedProviderId}`
      : `/owner/customers/${encodeURIComponent(phone)}${suffix}`;
  const [selected, setSelected]       = useState<string | null>(null);
  const [profile, setProfile]         = useState<CrmCustomerSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError]     = useState(false);
  const [profileCalView, setProfileCalView]           = useState<"hijri" | "gregorian">(calendarPreference);
  const notesRef = useRef<CustomerNotesHandle>(null);
  const profileRequest = useRef(0);
  useEffect(() => {
    setProfileCalView(calendarPreference);
  }, [calendarPreference]);

  /* ── Edit modal state ── */
  const [editOpen, setEditOpen]   = useState(false);
  const [editName, setEditName]   = useState("");
  const [editPhone, setEditPhone] = useState("");

  /* ── Delete confirmation state ── */
  const [deleteOpen, setDeleteOpen] = useState(false);

  /* ── Edit mutation ── */
  const editMutation = useMutation({
    mutationFn: async ({ oldPhone, name, phone }: { oldPhone: string; name: string; phone: string }) => {
      const r = await apiFetch(customerApiPath(oldPhone), {
        method: "PUT",
        body: JSON.stringify({ name, phone }),
      });
      if (!r.ok) throw new Error("فشل تحديث بيانات العميل");
      return r.json() as Promise<{ ok: boolean; newPhone: string }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["owner", "customers"] });
      qc.invalidateQueries({ queryKey: ["owner", "service-clients", scopedProviderId] });
      qc.invalidateQueries({ queryKey: ["owner", "crm-customers"] });
      const newPhone = data.newPhone ?? selected!;
      setSelected(newPhone);
      loadProfile(newPhone);
      setEditOpen(false);
      toast({ title: "تم تحديث بيانات العميل بنجاح" });
    },
    onError: () => toast({ title: "حدث خطأ أثناء التحديث", variant: "destructive" }),
  });

  /* ── Delete mutation ── */
  const deleteMutation = useMutation({
    mutationFn: async (phone: string) => {
      const r = await apiFetch(customerApiPath(phone), { method: "DELETE" });
      if (!r.ok) throw new Error("فشل حذف العميل");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "customers"] });
      qc.invalidateQueries({ queryKey: ["owner", "service-clients", scopedProviderId] });
      qc.invalidateQueries({ queryKey: ["owner", "crm-customers"] });
      setSelected(null);
      setProfile(null);
      setDeleteOpen(false);
      toast({ title: "تم حذف العميل وسجلّ حجوزاته" });
    },
    onError: () => toast({ title: "حدث خطأ أثناء الحذف", variant: "destructive" }),
  });

  async function loadProfile(phone: string) {
    const request = ++profileRequest.current;
    try { await notesRef.current?.flush(); } catch { return; }
    if (request !== profileRequest.current) return;
    setSelected(phone);
    setProfile(null);
    setProfileError(false);
    setProfileLoading(true);
    setProfileCalView(calendarPreference);
    try {
      const data = await getOwnerCrmProfile({ phone, providerId: scopedProviderId ?? undefined }, { credentials: "include" });
      if (request !== profileRequest.current) return;
      setProfile(data);
    } catch {
      if (request === profileRequest.current) setProfileError(true);
    }
    if (request === profileRequest.current) setProfileLoading(false);
  }

  async function saveCustomerNote(phone: string, notes: string) {
    const response = await apiFetch(customerApiPath(phone, "/note"), {
      method: "PUT",
      body: JSON.stringify({ notes }),
      keepalive: true,
    });
    if (!response.ok) throw new Error("تعذّر حفظ الملاحظة");
  }

  const statCard = (label: string, value: string) => (
    <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );

  return (
    <div className="flex gap-4 min-h-[520px]" dir="rtl">
      {/* ── Right panel in RTL: paginated customer directory ── */}
      <div className={`flex flex-col gap-3 ${selected ? "hidden lg:flex lg:w-72 shrink-0" : "w-full"}`}>
        <CustomerDirectory key={`${repUnit.type}:${scopedProviderId ?? "all"}`}
          scope={repUnit.type === "service" ? "service" : repUnit.type === "chalet" ? "chalet" : "all"}
          providerId={scopedProviderId ?? undefined} selected={selected}
          onSelect={phone => { void loadProfile(phone); }} calendar={profileCalView}
          guide={<SectionGuideButton sectionKey="customers" />} />
      </div>

      {/* ── Right panel: profile ── */}
      {selected && (
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Back button (mobile) */}
          <button
            onClick={async () => {
              try { await notesRef.current?.flush(); } catch { return; }
              ++profileRequest.current; setSelected(null); setProfile(null);
            }}
            className="lg:hidden flex items-center gap-1.5 text-sm text-primary font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            العودة للقائمة
          </button>

          {profileLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary w-6 h-6" /></div>
          ) : profileError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <svg className="w-8 h-8 text-destructive/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm font-medium">تعذّر تحميل بيانات العميل</p>
              <button
                onClick={() => selected && loadProfile(selected)}
                className="text-xs text-primary hover:underline"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : !profile ? null : (
            <>
              {/* Basic info */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-foreground">{profile.clientName}</p>
                    <p dir="ltr" className="text-sm text-muted-foreground">{toAr(profile.clientPhone)}</p>
                  </div>
                  {/* Edit & Delete actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={async () => {
                        try { await notesRef.current?.flush(); } catch { return; }
                        setEditName(profile.clientName);
                        setEditPhone(profile.clientPhone);
                        setEditOpen(true);
                      }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="تعديل بيانات العميل"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        try { await notesRef.current?.flush(); } catch { return; }
                        setDeleteOpen(true);
                      }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="حذف العميل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── Section A: Basic Info Stats ── */}
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {statCard("إجمالي الحجوزات", (() => { const n = profile.totalBookings; return `${toAr(n)} ${n >= 3 && n <= 10 ? "حجوزات" : "حجز"}`; })())}
                  {serviceScope && statCard("عمليات البيع السريع", toAr(profile.totalSales ?? 0))}
                  {statCard("إجمالي الإيراد", `${toAr(profile.totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 2 }))} ر.س`)}
                </div>
                {/* ID number + last booking */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">رقم الهوية الوطنية</p>
                    <p className="text-base font-bold text-foreground font-mono" dir="ltr">
                      {profile.clientIdNumber ?? <span className="text-muted-foreground font-normal text-sm">غير مسجّل</span>}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">{serviceScope ? "آخر عملية" : "آخر حجز"}</p>
                    <CustomerDate value={profile.lastBookingDate} preference={profileCalView} />
                  </div>
                </div>
              </div>

              {/* ── Tabbed Sections: Bookings / Contracts / Insurance ── */}
              <CustomerHistory key={`history:${scopedProviderId ?? "chalet"}:${profile.clientPhone}`}
                profile={profile} providerId={scopedProviderId ?? undefined}
                calendar={profileCalView} onCalendarChange={setProfileCalView} />
              {/* ── Private Notes ── */}
              <CustomerNotes key={`notes:${serviceScope ? scopedProviderId : "chalet"}:${profile.clientPhone}`}
                ref={notesRef} initialValue={profile.note ?? ""}
                save={value => saveCustomerNote(profile.clientPhone, value)} />
            </>
          )}
        </div>
      )}

      {/* ── Edit Customer Modal ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تعديل بيانات العميل</DialogTitle>
            <DialogDescription>يمكنك تحديث الاسم أو رقم الجوال. سيُطبَّق التغيير على جميع حجوزات هذا العميل.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">الاسم</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="اسم العميل"
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">رقم الجوال</label>
              <Input
                type="tel"
                inputMode="tel"
                value={toAr(editPhone)}
                onChange={(e) => setEditPhone(fromAr(e.target.value))}
                placeholder="٠٥••••••••"
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-row-reverse sm:flex-row-reverse">
            <Button
              onClick={() =>
                editMutation.mutate({ oldPhone: selected!, name: editName.trim(), phone: editPhone.trim() })
              }
              disabled={editMutation.isPending || !editName.trim() || !editPhone.trim()}
              className="flex-1"
            >
              {editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              حفظ التغييرات
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed pt-1">
              هل أنت متأكد من حذف العميل وسجل حجوزاته؟
              <br />
              <span className="font-semibold text-foreground">{profile?.clientName}</span>
              {" — "}
              <span dir="ltr">{toAr(profile?.clientPhone)}</span>
              <br />
              <span className="text-destructive/80 text-sm">لا يمكن التراجع عن هذه العملية.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row-reverse sm:flex-row-reverse">
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(selected!)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              نعم، احذف العميل
            </Button>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="flex-1">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
