import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Plus, CheckCircle, Trash2, Loader2, Shield, Scissors, RefreshCw } from "lucide-react";
import { formatDualDate, withHijriEra, toHijri } from "@/lib/hijri";
import { InsuranceProofGallery, InsuranceProofImages } from "@/components/owner/InsuranceProofImages";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { Textarea } from "@/components/ui/textarea";
import { useServiceErp } from "@/components/owner/OwnerDashboardContexts";
import { apiFetch } from "@/components/owner/owner-api";
import { uploadFile } from "@/components/owner/finance-shared";


/* ── Service Booking Insurance Tab ───────────────────────────── */
export function ServiceBookingInsurancesTab() {
  const { providerId } = useServiceErp();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [actionOpen, setActionOpen] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"refund" | "deduct" | null>(null);
  const [deductForm, setDeductForm] = useState({ insuranceDeductAmount: "", insuranceDeductNote: "" });
  const [saving, setSaving] = useState(false);
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [proofUploading, setProofUploading] = useState(false);
  useEffect(() => {
    setActionOpen(null);
    setActionType(null);
    setProofImages([]);
    setProofUploading(false);
  }, [providerId]);

  const { data: appointments = [], isLoading } = useQuery<any[]>({
    queryKey: ["service-appointments", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments`);
      return r.ok ? r.json() : [];
    },
    enabled: !!providerId,
  });

  const insAppts = appointments.filter(a => a.insuranceAmount && parseFloat(a.insuranceAmount) > 0);
  const totalHeld     = insAppts.filter(a => !a.insuranceStatus || a.insuranceStatus === "held").reduce((s, a) => s + parseFloat(a.insuranceAmount), 0);
  const totalRefunded = insAppts.filter(a => a.insuranceStatus === "refunded").reduce((s, a) => s + parseFloat(a.insuranceAmount), 0);
  const totalDeducted = insAppts.filter(a => a.insuranceStatus === "deducted").reduce((s, a) => s + parseFloat(a.insuranceDeductAmount ?? a.insuranceAmount ?? "0"), 0);

  async function handleRefund(apptId: number, amount: number) {
    setSaving(true);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments/${apptId}`, {
        method: "PATCH",
        body: JSON.stringify({ insuranceStatus: "refunded" }),
      });
      if (!r.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["service-appointments", providerId] });
      toast({ title: `تم تسجيل استرداد التأمين ✓`, description: `${Math.round(amount).toLocaleString()} ر.س — مُعاد للعميل` });
      setActionOpen(null); setActionType(null);
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleDeduct(apptId: number) {
    if (saving || proofUploading) return;
    if (!deductForm.insuranceDeductAmount || !deductForm.insuranceDeductNote) {
      toast({ title: "المبلغ والتوثيق مطلوبان", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments/${apptId}`, {
        method: "PATCH",
        body: JSON.stringify({
          insuranceStatus: "deducted",
          insuranceDeductAmount: deductForm.insuranceDeductAmount,
          insuranceDeductNote: deductForm.insuranceDeductNote,
          insuranceProofImages: proofImages,
        }),
      });
      if (!r.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["service-appointments", providerId] });
      toast({ title: "تم تسجيل الخصم التأميني ✓", description: `${parseFloat(deductForm.insuranceDeductAmount).toLocaleString()} ر.س — موثّق` });
      setActionOpen(null); setActionType(null); setDeductForm({ insuranceDeductAmount: "", insuranceDeductNote: "" });
      setProofImages([]);
    } catch { toast({ title: "خطأ في التسجيل", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  const insStatusMeta: Record<string, { label: string; cls: string }> = {
    held:     { label: "محتجز",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    refunded: { label: "مسترد",  cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    deducted: { label: "مخصوم",  cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  };

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-blue-700 dark:text-blue-300">{Math.round(totalHeld).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">ر.س</span></p>
          <p className="text-xs text-muted-foreground">محتجز</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40 rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-green-700 dark:text-green-300">{Math.round(totalRefunded).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">ر.س</span></p>
          <p className="text-xs text-muted-foreground">مسترد</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-red-600 dark:text-red-400">{Math.round(totalDeducted).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">ر.س</span></p>
          <p className="text-xs text-muted-foreground">مخصوم</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-xl px-4 py-2.5 text-xs text-blue-700 dark:text-blue-300 font-semibold flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 shrink-0" />
        هذه القائمة تعرض الحجوزات التي تتضمن مبالغ تأمينية — يمكنك تسجيل الاسترداد أو توثيق الخصم لكل حجز
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : insAppts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="font-medium">لا توجد حجوزات بتأمين</p>
          <p className="text-xs mt-1">عند تسجيل حجز بمبلغ تأميني، سيظهر هنا</p>
        </div>
      ) : (
        <div className="space-y-3">
          {insAppts.map((a: any) => {
            const dual = formatDualDate(a.dateStr);
            const insAmt = parseFloat(a.insuranceAmount ?? "0");
            const status = a.insuranceStatus ?? "held";
            const meta = insStatusMeta[status] ?? insStatusMeta.held;
            const isOpen = actionOpen === a.id;
            return (
              <div key={a.id} className="bg-card border border-border rounded-2xl px-4 py-4 space-y-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-bold text-foreground">{a.clientName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <p className="text-xs text-primary font-semibold">{withHijriEra(dual.hijri)}</p>
                    <p className="text-xs text-muted-foreground">{dual.gregorian} م{a.duration ? ` · ${a.duration}` : ""}</p>
                    <div className="flex gap-3 mt-1.5 text-xs flex-wrap">
                      <span className="font-bold text-blue-700 dark:text-blue-300">تأمين: {insAmt.toLocaleString()} ر.س</span>
                      {a.amount && <span className="text-muted-foreground">مبلغ الخدمة: {parseFloat(a.amount).toLocaleString()} ر.س</span>}
                    </div>
                    {status === "deducted" && a.insuranceDeductNote && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">سبب الخصم: {a.insuranceDeductNote}{a.insuranceDeductAmount ? ` (${parseFloat(a.insuranceDeductAmount).toLocaleString()} ر.س)` : ""}</p>
                    )}
                    {status === "deducted" && <InsuranceProofGallery images={a.insuranceProofImages} />}
                  </div>

                  {status === "held" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" disabled={saving || proofUploading} onClick={() => { setActionOpen(a.id); setActionType("refund"); }}
                        className="rounded-xl text-xs gap-1 h-8 border-green-300 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20">
                        <RefreshCw className="w-3 h-3" />استرداد
                      </Button>
                      <Button size="sm" variant="outline" disabled={saving || proofUploading} onClick={() => { setActionOpen(a.id); setActionType("deduct"); setProofImages(a.insuranceProofImages ?? []); setDeductForm({ insuranceDeductAmount: String(insAmt), insuranceDeductNote: "" }); }}
                        className="rounded-xl text-xs gap-1 h-8 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Scissors className="w-3 h-3" />خصم
                      </Button>
                    </div>
                  )}
                </div>

                {/* Action panel */}
                {isOpen && actionType === "refund" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="border-t border-border pt-3 space-y-2">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">تأكيد استرداد التأمين للعميل</p>
                    <p className="text-xs text-muted-foreground">سيتم تسجيل إعادة مبلغ <span className="font-bold text-foreground">{insAmt.toLocaleString()} ر.س</span> للعميل.</p>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setActionOpen(null); setActionType(null); }}>إلغاء</Button>
                      <Button size="sm" disabled={saving} onClick={() => handleRefund(a.id, insAmt)}
                        className="rounded-xl gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}تأكيد الاسترداد
                      </Button>
                    </div>
                  </motion.div>
                )}

                {isOpen && actionType === "deduct" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="border-t border-border pt-3 space-y-3">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">توثيق خصم من التأمين</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">مبلغ الخصم (ر.س) *</label>
                        <Input type="number" value={deductForm.insuranceDeductAmount} onChange={e => setDeductForm(p => ({ ...p, insuranceDeductAmount: e.target.value }))}
                          placeholder="0" className="rounded-xl h-9" max={insAmt} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">سبب الخصم / التوثيق *</label>
                        <Input value={deductForm.insuranceDeductNote} onChange={e => setDeductForm(p => ({ ...p, insuranceDeductNote: e.target.value }))}
                          placeholder="وصف التلفيات أو السبب..." className="rounded-xl h-9" />
                      </div>
                    </div>
                    <InsuranceProofImages key={`${providerId}:${a.id}`} images={proofImages} onChange={setProofImages}
                      upload={uploadFile} onUploadingChange={setProofUploading} disabled={saving} />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" disabled={saving || proofUploading} className="rounded-xl" onClick={() => { setActionOpen(null); setActionType(null); setProofImages([]); }}>إلغاء</Button>
                      <Button size="sm" disabled={saving || proofUploading} onClick={() => handleDeduct(a.id)}
                        className="rounded-xl gap-1.5 bg-red-600 hover:bg-red-700 text-white">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}حفظ الخصم
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Service Insurances Tab ──────────────────────────────── */
function ServiceInsurancesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refundOpen, setRefundOpen] = useState<number | null>(null);
  const [refundForm, setRefundForm] = useState({ refundAmount: "", refundNote: "" });
  const [refundSaving, setRefundSaving] = useState(false);
  const emptyForm = { policyName: "", insurerName: "", amount: "", renewalDate: "", notes: "" };
  const [form, setForm] = useState({ ...emptyForm });

  const { data: insurances = [], isLoading } = useQuery<any[]>({
    queryKey: ["service-insurances"],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/insurances");
      return r.ok ? r.json() : [];
    },
  });

  async function handleSave() {
    if (!form.policyName) {
      toast({ title: "اسم السياسة مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch("/providers/my/insurances", { method: "POST", body: JSON.stringify({ ...form, amount: form.amount || "0" }) });
      if (!r.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["service-insurances"] });
      toast({ title: "تمت إضافة سياسة التأمين ✓" });
      setForm({ ...emptyForm }); setShowForm(false);
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await apiFetch(`/providers/my/insurances/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["service-insurances"] });
      toast({ title: "تم الحذف" });
    } catch { toast({ title: "خطأ", variant: "destructive" }); }
    finally { setDeletingId(null); }
  }

  async function handleRefundSave(insId: number) {
    if (!refundForm.refundAmount || !refundForm.refundNote) {
      toast({ title: "المبلغ والتوثيق مطلوبان", variant: "destructive" });
      return;
    }
    setRefundSaving(true);
    try {
      const r = await apiFetch(`/providers/my/insurances/${insId}`, {
        method: "PATCH",
        body: JSON.stringify({ refundAmount: refundForm.refundAmount, refundNote: refundForm.refundNote }),
      });
      if (!r.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["service-insurances"] });
      toast({ title: "تم تسجيل الاسترداد/الخصم ✓" });
      setRefundOpen(null); setRefundForm({ refundAmount: "", refundNote: "" });
    } catch { toast({ title: "خطأ في التسجيل", variant: "destructive" }); }
    finally { setRefundSaving(false); }
  }

  const totalPremiums = insurances.reduce((s, i) => s + parseFloat(i.amount ?? "0"), 0);
  const totalRefunds  = insurances.reduce((s, i) => s + parseFloat(i.refundAmount ?? "0"), 0);
  const soonExpiring  = insurances.filter(i => {
    if (!i.renewalDate) return false;
    const days = Math.ceil((new Date(i.renewalDate).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-foreground">{insurances.length}</p>
          <p className="text-xs text-muted-foreground">سياسة نشطة</p>
        </div>
        <div className={`border rounded-xl p-3 text-center ${soonExpiring > 0 ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40" : "bg-card border-border"}`}>
          <p className={`text-lg font-extrabold ${soonExpiring > 0 ? "text-amber-600" : "text-foreground"}`}>{soonExpiring}</p>
          <p className="text-xs text-muted-foreground">تنتهي خلال 30 يوم</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-extrabold text-foreground">{totalRefunds.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">إجمالي المسترد (ر.س)</p>
        </div>
      </div>

      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="gap-2 rounded-xl" variant="outline">
          <Plus className="w-4 h-4" />إضافة سياسة تأمين
        </Button>
      )}

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold">سياسة تأمين جديدة</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">اسم السياسة *</label>
              <Input value={form.policyName} onChange={e => setForm(p => ({ ...p, policyName: e.target.value }))} placeholder="تأمين المعدات، تأمين مسؤولية..." className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">شركة التأمين</label>
              <Input value={form.insurerName} onChange={e => setForm(p => ({ ...p, insurerName: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">مبلغ القسط السنوي (ر.س)</label>
              <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">تاريخ التجديد</label>
              <DualCalendarPicker
                value={form.renewalDate}
                onChange={value => setForm(p => ({ ...p, renewalDate: value }))}
                placeholder="اختر تاريخ التجديد"
                mode="gregorian"
                className="min-h-10 rounded-xl border border-input bg-background px-3"
              />
              {form.renewalDate && <p className="text-xs text-primary">{toHijri(form.renewalDate)} هـ</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="rounded-xl resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowForm(false)} className="rounded-xl">إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}حفظ
            </Button>
          </div>
        </motion.div>
      )}

      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        : insurances.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">لا توجد سياسات تأمين مسجلة</p>
            <p className="text-xs mt-1">أضف سياسات التأمين لمتابعة الأقساط والتجديدات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insurances.map((ins: any) => {
              const daysLeft = ins.renewalDate ? Math.ceil((new Date(ins.renewalDate).getTime() - Date.now()) / 86400000) : null;
              const urgent   = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
              const expired  = daysLeft !== null && daysLeft < 0;
              const hasRefund = parseFloat(ins.refundAmount ?? "0") > 0;
              return (
                <div key={ins.id} className={`bg-card border rounded-2xl overflow-hidden ${urgent ? "border-amber-300 dark:border-amber-700" : expired ? "border-red-300 dark:border-red-700" : "border-border"}`}>
                  <div className="px-4 py-3.5 flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground">{ins.policyName}</span>
                        {ins.insurerName && <span className="text-xs text-muted-foreground">{ins.insurerName}</span>}
                        {urgent && <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">تنتهي قريباً ({daysLeft} يوم)</span>}
                        {expired && <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-semibold">منتهية</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        قسط: <span className="font-semibold text-foreground">{parseFloat(ins.amount).toLocaleString()} ر.س</span>
                        {ins.renewalDate && <> · تجديد: <span className="text-primary">{toHijri(ins.renewalDate)} هـ</span></>}
                      </p>
                      {hasRefund && (
                        <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                          مسترد/مخصوم: {parseFloat(ins.refundAmount).toLocaleString()} ر.س
                          {ins.refundNote && ` — ${ins.refundNote}`}
                        </p>
                      )}
                      {ins.notes && <p className="text-xs text-muted-foreground mt-0.5">{ins.notes}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setRefundOpen(ins.id); setRefundForm({ refundAmount: ins.refundAmount ?? "", refundNote: ins.refundNote ?? "" }); }}
                        className="rounded-lg text-xs gap-1 h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                        استرداد/خصم
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(ins.id)} disabled={deletingId === ins.id}
                        className="rounded-lg h-8 w-8 text-red-500 hover:text-red-600">
                        {deletingId === ins.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  {/* Refund panel */}
                  {refundOpen === ins.id && (
                    <div className="border-t border-border bg-muted/40 px-4 py-3 space-y-3">
                      <p className="text-xs font-bold text-foreground">تسجيل استرداد أو خصم موثّق</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground">المبلغ المسترد/المخصوم (ر.س) *</label>
                          <Input type="number" value={refundForm.refundAmount} onChange={e => setRefundForm(p => ({ ...p, refundAmount: e.target.value }))} placeholder="0" className="rounded-lg h-9 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground">التوثيق / السبب *</label>
                          <Input value={refundForm.refundNote} onChange={e => setRefundForm(p => ({ ...p, refundNote: e.target.value }))} placeholder="مثال: استرداد بسبب إلغاء، خصم مبكر..." className="rounded-lg h-9 text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setRefundOpen(null)} className="rounded-lg text-xs">إلغاء</Button>
                        <Button size="sm" onClick={() => handleRefundSave(ins.id)} disabled={refundSaving} className="rounded-lg text-xs gap-1">
                          {refundSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}تأكيد التسجيل
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between text-sm pt-1">
              <span className="text-muted-foreground">إجمالي الأقساط: <span className="font-semibold text-foreground">{totalPremiums.toLocaleString()} ر.س</span></span>
              <span className="text-muted-foreground">صافي بعد الاسترداد: <span className="font-semibold text-green-600">{(totalPremiums - totalRefunds).toLocaleString()} ر.س</span></span>
            </div>
          </div>
        )}
    </div>
  );
}
