import { useEffect, useState, useMemo, useRef } from "react";
import { defaultExpenseActivity, expenseTarget } from "@/lib/expenseTarget";
import { createWithdrawalExpense } from "@/lib/withdrawalExpense";
import { activityKey } from "@/lib/dashboardActivity";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDualDate, HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import { isExpenseInScope } from "@/lib/expenseScope";
import { expenseInFinancialSelection, financialSelectionKey } from "@/lib/financialSelection";
import { Plus, Trash2, Wallet, Receipt, Camera, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toAr, fromAr } from "@/lib/utils";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBankAmount } from "@/lib/bankLedger";
import { useAdminFinance, useReadOnly } from "@/components/owner/OwnerDashboardContexts";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { GREGORIAN_MONTHS_AR, getBookingMonthKey, getBookingMonthLabel, getCalCorrespondenceHint, getCurrentFinanceMonth, getLocalDateStr } from "@/components/owner/owner-calendar";
import { EXPENSE_CATS, ExpenseCatItem, OwnerExpense, PaginatedItems, PaginationBar, catColorClass, uploadFile } from "@/components/owner/finance-shared";
import { toArN } from "@/components/owner/owner-formatting";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


export function ExpensesTab() {
  const { unit, expenseActivities = [], financialSelection } = useAdminFinance();
  const [expenseActivityKey, setExpenseActivityKey] = useState("default");
  const defaultActivity = defaultExpenseActivity(unit, expenseActivities);
  const expenseActivity = unit.type === "all" && expenseActivityKey !== "default"
    ? expenseActivities.find(activity => activityKey(activity) === expenseActivityKey)
    : defaultActivity;
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const qc = useQueryClient();
  const { data: mySubmissions = [] } = useQuery<any[]>({
    queryKey: ["my-submissions-for-report"],
    queryFn: async () => {
      const r = await apiFetch("/submissions/mine");
      if (!r.ok) return [];
      return r.json();
    },
  });
  const [expCalType, setExpCalType] = useState<"hijri" | "gregorian">("hijri");
  const initialExpenseMonth = getCurrentFinanceMonth("hijri");
  const [expYear, setExpYear] = useState<string>(() => initialExpenseMonth.split("-")[0]);
  const [expMonth, setExpMonth] = useState<string>(() => initialExpenseMonth);
  const [form, setForm] = useState({ categoryId: "", dateStr: new Date().toISOString().slice(0, 10), amount: "", notes: "", customCategory: "" });
  const [saveAsCategory, setSaveAsCategory] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; expId: number | null }>({ open: false, expId: null });
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [wAmount, setWAmount] = useState("");
  const [wDate, setWDate] = useState(getLocalDateStr());
  const [wNote, setWNote] = useState("");
  const [wSaving, setWSaving] = useState(false);
  const [wDateMode, setWDateMode] = useState<"hijri" | "gregorian">("hijri");
  const [dateInputMode, setDateInputMode] = useState<"hijri" | "gregorian">("hijri");
  const { toast } = useToast();

  /* ── dynamic categories ── */
  const { data: expenseCats = [] } = useQuery<ExpenseCatItem[]>({
    queryKey: ["catalog", "expense-categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/expense-categories`, { credentials: "include" });
      if (!r.ok) return EXPENSE_CATS.map((c, i) => ({ id: i + 1, name: c.label, emoji: c.emoji, color: c.key === "other" ? "slate" : c.color.split("-")[1] ?? "slate", isOther: c.key === "other", sortOrder: i }));
      return r.json();
    },
  });

  useEffect(() => {
    if (expenseCats.length > 0 && !form.categoryId) {
      setForm((f) => ({ ...f, categoryId: String(expenseCats[0].id) }));
    }
  }, [expenseCats]);

  const selectedCat = expenseCats.find((c) => String(c.id) === form.categoryId);
  const isOtherSelected = selectedCat?.isOther ?? false;

  /* combined lookup for list display (supports both old enum keys + new names) */
  const catDisplayMap = useMemo(() => {
    const map: Record<string, { label: string; emoji: string; colorClass: string }> = {};
    for (const c of expenseCats) {
      map[c.name] = { label: c.name, emoji: c.emoji, colorClass: catColorClass(c.color) };
    }
    for (const c of EXPENSE_CATS) {
      map[c.key] = { label: c.label, emoji: c.emoji, colorClass: c.color };
    }
    return map;
  }, [expenseCats]);

  const { data: expenses = [], isLoading, isError: expensesFailed, refetch: refetchExpenses } = useQuery<OwnerExpense[]>({
    queryKey: ["owner", "expenses"],
    queryFn: async () => {
      const r = await apiFetch(`/owner/expenses`);
      if (!r.ok) throw new Error("تعذر تحميل المصروفات");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });

  const expYearOptions = useMemo(() => {
    const years = new Set<string>();
    // Always include today's year as default
    if (expCalType === "hijri") {
      years.add(String(toHijriComponents(new Date()).year));
    } else {
      years.add(String(new Date().getFullYear()));
    }
    // Add any year that has actual expense records
    for (const e of expenses) {
      if (!(e as any).dateStr) continue;
      years.add(getBookingMonthKey((e as any).dateStr, expCalType).split("-")[0]);
    }
    return Array.from(years).sort().reverse();
  }, [expenses, expCalType]);

  const expMonthOptions = useMemo(() => {
    if (!expYear) return [];
    const now = new Date();
    const keys = new Set<string>();
    // Always include today's month if the selected year is the current year
    let curYearStr: string, curMonthKey: string;
    if (expCalType === "hijri") {
      const h = toHijriComponents(now);
      curYearStr = String(h.year);
      curMonthKey = `${h.year}-${String(h.month).padStart(2, "0")}`;
    } else {
      curYearStr = String(now.getFullYear());
      curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    if (expYear === curYearStr) keys.add(curMonthKey);
    // Add any month in the selected year that has actual expense records
    for (const e of expenses) {
      if (!(e as any).dateStr) continue;
      const key = getBookingMonthKey((e as any).dateStr, expCalType);
      if (!key.startsWith(expYear + "-")) continue;
      keys.add(key);
    }
    return Array.from(keys).sort().reverse();
  }, [expenses, expCalType, expYear]);

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/owner/expenses", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل الحفظ");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "expenses"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
      setForm((f) => ({ ...f, amount: "", notes: "", customCategory: "" }));
      setReceiptUrl(null);
    },
    onError: (error: Error) => {
      toast({ title: "تعذر تسجيل المصروف", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/owner/expenses/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "expenses"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
    },
  });

  async function handleReceiptUpload(file: File) {
    setUploading(true);
    const url = await uploadFile(file);
    setReceiptUrl(url);
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isReadOnly) { onBlockedEdit(); return; }
    const amt = parseFloat(form.amount);
    if (!amt || isNaN(amt)) return;
    let target: ReturnType<typeof expenseTarget>;
    try {
      if (!expenseActivity) throw new Error("النشاط المختار لم يعد متاحًا. اختر نشاطًا آخر أو المصروف العام.");
      target = expenseTarget(expenseActivity);
    } catch (error) {
      toast({ title: "تعذر تسجيل المصروف", description: (error as Error).message, variant: "destructive" });
      return;
    }
    if (isOtherSelected && !form.customCategory.trim()) return;
    if (isOtherSelected && saveAsCategory && form.customCategory.trim()) {
      try {
        await apiFetch("/owner/expense-categories", {
          method: "POST",
          body: JSON.stringify({ name: form.customCategory.trim() }),
        });
        qc.invalidateQueries({ queryKey: ["catalog", "expense-categories"] });
      } catch { /* حفظ الفئة اختياري */ }
    }
    addMutation.mutate({
      category: selectedCat?.name ?? "أخرى",
      customCategory: isOtherSelected ? form.customCategory.trim() : undefined,
      dateStr: form.dateStr,
      amount: amt,
      notes: form.notes || undefined,
      receiptUrl: receiptUrl || undefined,
      ...target,
    });
    setSaveAsCategory(false);
  }

  // Derive providerId from unit context
  const unitProviderId = unit.type === "service" ? (unit as any).id : null;

  // Filter expenses by calendar period then by unit
  const filteredExpenses = useMemo(() => {
    let result: OwnerExpense[] = expenses;
    if (expMonth) {
      result = result.filter(e => (e as any).dateStr && getBookingMonthKey((e as any).dateStr, expCalType) === expMonth);
    } else if (expYear) {
      result = result.filter(e => (e as any).dateStr && getBookingMonthKey((e as any).dateStr, expCalType).startsWith(expYear));
    }
    result = result.filter(expense => financialSelection === undefined ? isExpenseInScope(expense, unit)
      : expenseInFinancialSelection(expense, financialSelection));
    return result;
  }, [expenses, expCalType, expYear, expMonth, unit, unitProviderId, financialSelection]);

  const totalMonth = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const expenseTotalLabel = expMonth
    ? `إجمالي ${getBookingMonthLabel(expMonth, expCalType)}`
    : expYear
      ? `إجمالي عام ${toArN(Number(expYear))} ${expCalType === "hijri" ? "هـ" : "م"}`
      : "الإجمالي العام";
  const expShowProp = unit.type === "all";
  const expTableCols = expShowProp
    ? "max-content max-content max-content 1fr max-content max-content max-content"
    : "max-content max-content 1fr max-content max-content max-content";

  return (
    <div className="expenses-screen space-y-5">
      <SectionGuideButton sectionKey="expenses" />
      {/* General entry is allowed; a selected or sole activity is linked automatically. */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          {defaultActivity.type === "all" ? "تسجيل مصروف عام" : `تسجيل مصروف: ${defaultActivity.name}`}
        </h2>
        <form onSubmit={handleSubmit} className="expense-entry-form space-y-3">
          {defaultActivity.type === "all" ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium block">ربط المصروف بعقار أو خدمة (اختياري)</label>
              <Select value={expenseActivityKey} onValueChange={setExpenseActivityKey}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">مصروف عام — دون تخصيص</SelectItem>
                  {expenseActivities.map(activity => activity.type !== "all" && (
                    <SelectItem key={activityKey(activity)} value={activityKey(activity)}>
                      {activity.type === "service" ? "خدمة" : "عقار"} — {activity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">يمكنك التسجيل مباشرة دون اختيار. المصروف العام يظهر في إجمالي جميع الأنشطة ولا يُنسب لخدمة محددة.</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">سيُسجّل المصروف تلقائيًا على نشاط «{defaultActivity.name}» دون الحاجة لاختيار إضافي.</p>
          )}
          {/* Row 1: 3-column grid — Category + Amount + Date */}
          <div className="grid grid-cols-3 gap-3">
            {/* Category */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">الفئة</label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v, customCategory: "" }))}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="اختر الفئة" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Amount */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">المبلغ (ر.س)</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="٠.٠٠"
                value={toAr(form.amount)}
                onChange={(e) => setForm((f) => ({ ...f, amount: fromAr(e.target.value) }))}
                className="h-11 text-right"
                required
              />
            </div>
            {/* Date with Hijri/Gregorian toggle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground font-medium">التاريخ</label>
                <div className="flex rounded-md border border-border overflow-hidden text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setDateInputMode("hijri")}
                    className={dateInputMode === "hijri"
                      ? "px-2 py-0.5 bg-primary text-primary-foreground transition-colors"
                      : "px-2 py-0.5 bg-background text-muted-foreground hover:bg-accent transition-colors"}
                  >هجري</button>
                  <button
                    type="button"
                    onClick={() => setDateInputMode("gregorian")}
                    className={dateInputMode === "gregorian"
                      ? "px-2 py-0.5 bg-primary text-primary-foreground border-r border-border transition-colors"
                      : "px-2 py-0.5 bg-background text-muted-foreground hover:bg-accent border-r border-border transition-colors"}
                  >ميلادي</button>
                </div>
              </div>
              <div className="rounded-md border bg-background px-3 py-2 h-11 flex items-center">
                <DualCalendarPicker
                  value={form.dateStr}
                  onChange={(v) => setForm((f) => ({ ...f, dateStr: v }))}
                  placeholder="اختر التاريخ"
                  mode={dateInputMode}
                />
              </div>
            </div>
          </div>

          {/* Custom category — full width, only when "أخرى" selected */}
          {isOtherSelected && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                اسم المصروف <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="مثال: تنظيف المكيفات، صيانة مسبح..."
                value={form.customCategory}
                onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                className="h-11"
                required
              />
              {form.customCategory.trim() && (
                <div
                  className="flex items-center gap-2 mt-2 cursor-pointer select-none group w-fit"
                  dir="rtl"
                  onClick={() => setSaveAsCategory((v) => !v)}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${saveAsCategory ? "bg-primary border-primary" : "border-muted-foreground/40 group-hover:border-primary/60"}`}>
                    {saveAsCategory && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-none stroke-white stroke-[2]">
                        <polyline points="1,4 4,7 9,1" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    حفظ كفئة دائمة في القائمة للمرات القادمة
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Notes (65%) + Receipt (35%) */}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-[2] min-w-[160px]">
              <label className="text-xs text-muted-foreground font-medium mb-1 block">ملاحظات (اختياري)</label>
              <Input
                placeholder="تفاصيل إضافية..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="flex-1 min-w-[120px] flex flex-col">
              <label className="text-xs text-muted-foreground font-medium mb-1 block opacity-0 select-none">رفع</label>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-11 flex items-center justify-center gap-2 px-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {receiptUrl ? "تم رفع الإيصال ✓" : "رفع إيصال"}
              </button>
              {receiptUrl && (
                <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline text-center mt-1">عرض الإيصال</a>
              )}
            </div>
          </div>

          {/* Submit — centered, capped at max-w-md */}
          <div className="flex justify-center pt-1">
            <Button type="submit" className="h-11 font-bold w-full max-w-md" disabled={addMutation.isPending || !form.amount}>
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Plus className="w-4 h-4 me-2" />}
              تسجيل المصروف
            </Button>
          </div>
        </form>
      </div>

      {/* ── Personal Withdrawals Quick Button ── */}
      {defaultActivity.type !== "all" && (
      <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">💸</span>
            <div>
              <div className="text-sm font-bold text-amber-800 dark:text-amber-300">تسجيل مسحوبات شخصية</div>
              <div className="text-xs text-amber-800 dark:text-amber-200">تُخصم من صافي الربح وتظهر في سجل المعاملات</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowWithdrawal(p => !p)}
            className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 transition-colors"
          >
            {showWithdrawal ? "إلغاء" : "+ إضافة"}
          </button>
        </div>
        {showWithdrawal && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isReadOnly) { onBlockedEdit(); return; }
              setWSaving(true);
              try {
                const payload = createWithdrawalExpense(defaultActivity, {
                  amount: Number(wAmount),
                  dateStr: wDate,
                  notes: wNote,
                });
                const r = await apiFetch("/owner/expenses", {
                  method: "POST",
                  body: JSON.stringify(payload),
                });
                if (!r.ok) {
                  const error = await r.json().catch(() => null);
                  throw new Error(error?.error || "تعذر تسجيل السحب. يرجى إعادة المحاولة.");
                }
                toast({ title: "تم تسجيل المسحوبات", description: `${payload.amount.toLocaleString("ar-SA")} ر.س` });
                setWAmount(""); setWNote(""); setWDate(getLocalDateStr());
                setShowWithdrawal(false);
                for (const key of ["expenses", "financial-summary", "financial-summary-rev", "transaction-history", "reports", "report-years"]) {
                  void qc.invalidateQueries({ queryKey: ["owner", key] });
                }
              } catch (error) {
                toast({
                  title: "تعذر تأكيد تسجيل السحب",
                  description: error instanceof Error ? error.message : "راجع سجل المصروفات قبل إعادة المحاولة.",
                  variant: "destructive",
                });
              } finally { setWSaving(false); }
            }}
            className="expense-entry-form space-y-2.5 pt-1 border-t border-amber-200 dark:border-amber-800"
          >
            {/* Row 1: Amount + Date (2-col grid) */}
            <div className="grid grid-cols-2 gap-2">
              {/* Amount — Arabic-Indic digits */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-amber-800 dark:text-amber-300">المبلغ (ر.س) *</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={toAr(wAmount)}
                  onChange={e => setWAmount(fromAr(e.target.value))}
                  placeholder="٠"
                  className="h-10 text-sm text-right"
                  required
                />
              </div>
              {/* Date — custom picker with Hijri/Gregorian toggle */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-800 dark:text-amber-300">التاريخ</label>
                  <div className="flex rounded-md border border-amber-300 dark:border-amber-700 overflow-hidden text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setWDateMode("hijri")}
                      className={wDateMode === "hijri"
                        ? "px-1.5 py-0.5 bg-amber-600 text-white transition-colors"
                        : "px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"}
                    >هجري</button>
                    <button
                      type="button"
                      onClick={() => setWDateMode("gregorian")}
                      className={wDateMode === "gregorian"
                        ? "px-1.5 py-0.5 bg-amber-600 text-white border-r border-amber-300 dark:border-amber-700 transition-colors"
                        : "px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border-r border-amber-300 dark:border-amber-700 transition-colors"}
                    >ميلادي</button>
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/10 px-3 py-1.5 h-10 flex items-center">
                  <DualCalendarPicker
                    value={wDate}
                    onChange={setWDate}
                    placeholder="اختر التاريخ"
                    mode={wDateMode}
                  />
                </div>
              </div>
            </div>
            {/* Row 2: Notes full width */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-amber-800 dark:text-amber-300">ملاحظة (اختياري)</label>
              <Input value={wNote} onChange={e => setWNote(e.target.value)} placeholder="مثال: سحب شخصي، راتب المالك..." className="h-10 text-sm" />
            </div>
            {/* Submit — centered, capped width */}
            <div className="flex justify-center">
              <Button type="submit" disabled={wSaving || !wAmount} size="sm" className="w-full max-w-xs bg-amber-600 hover:bg-amber-700 text-white h-10 font-bold">
                {wSaving ? "جاري الحفظ..." : "💸 تسجيل المسحوبات"}
              </Button>
            </div>
          </form>
        )}
      </div>
      )}

      {/* Month Filter + List */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            المصروفات
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
              {(["gregorian", "hijri"] as const).map(mode => (
                <button key={mode} type="button"
                  onClick={() => {
                    const currentMonth = getCurrentFinanceMonth(mode);
                    setExpCalType(mode);
                    setExpYear(currentMonth.split("-")[0]);
                    setExpMonth(currentMonth);
                  }}
                  className={`text-xs px-3 py-1.5 font-medium transition-colors ${expCalType === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >{mode === "hijri" ? "هجري" : "ميلادي"}</button>
              ))}
            </div>
            <Select value={expYear || "__all__"} onValueChange={(yr) => { setExpYear(yr === "__all__" ? "" : yr); setExpMonth(""); }}>
              <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7rem] shrink-0" dir="rtl">
                {expYear
                  ? <span className="text-sm font-medium">{expCalType === "hijri" ? `${toArN(Number(expYear))} هـ` : `${toArN(Number(expYear))} م`}</span>
                  : <span className="text-sm text-muted-foreground">كل السنوات</span>}
              </SelectTrigger>
              <SelectContent dir="rtl" align="end">
                <SelectItem value="__all__"><span className="text-sm">كل السنوات</span></SelectItem>
                {expYearOptions.map(yr => (
                  <SelectItem key={yr} value={yr}>
                    {expCalType === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={!expYear ? "all" : (expMonth || "all")}
              onValueChange={(v) => { if (expYear) setExpMonth(v === "all" ? "" : v); }}
              disabled={!expYear}
            >
              <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[8rem] shrink-0" dir="rtl">
                {expMonth && expYear ? (() => {
                  const ms = Number(expMonth.split("-")[1]);
                  return expCalType === "hijri"
                    ? <span className="font-medium">{HIJRI_MONTHS_AR[ms - 1]}</span>
                    : <span className="font-medium">{GREGORIAN_MONTHS_AR[ms - 1]}</span>;
                })() : <span className="text-muted-foreground">كل الشهور</span>}
              </SelectTrigger>
              <SelectContent dir="rtl" align="end" className="max-h-[260px]">
                <SelectItem value="all"><span className="text-sm">كل الشهور</span></SelectItem>
                {expMonthOptions.map(key => {
                  const [ys, ms] = key.split("-").map(Number);
                  const primary = expCalType === "hijri" ? `${HIJRI_MONTHS_AR[ms-1]} ${toArN(ys)} هـ` : `${GREGORIAN_MONTHS_AR[ms-1]} ${toArN(ys)} م`;
                  const corr = getCalCorrespondenceHint(key, expCalType);
                  return (
                    <SelectItem key={key} value={key} textValue={primary} className="h-auto items-start py-2">
                      <div style={{width:"100%",direction:"rtl"}}>
                        <div style={{fontWeight:"600",fontSize:"13px",textAlign:"right"}}>{primary}</div>
                        {corr && <div style={{fontSize:"11px",color:"#888",textAlign:"right",marginTop:"2px"}}>{corr}</div>}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : expensesFailed ? (
          <div role="alert" className="py-8 text-center space-y-3">
            <p className="text-sm text-destructive">تعذر تحميل المصروفات. أعد المحاولة لعرض الرواتب والمصروفات المسجلة.</p>
            <Button variant="outline" onClick={() => void refetchExpenses()}>إعادة المحاولة</Button>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد مصروفات في هذا الشهر</p>
          </div>
        ) : (
          <PaginatedItems items={filteredExpenses} resetKey={`${expCalType}|${expYear}|${expMonth}|${unit.type}|${unit.type === "chalet" ? (unit as any).submissionId ?? "" : ""}|${financialSelectionKey(financialSelection ?? null)}`}>
            {(pagination) => (
              <div ref={pagination.tableRef} className="rounded-xl overflow-hidden border border-border/40 scroll-mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse" dir="rtl">
              <colgroup>
                <col className="w-[15%]" />
                {expShowProp && <col className="w-[15%]" />}
                <col className={expShowProp ? "w-[15%]" : "w-[20%]"} />
                <col className={expShowProp ? "w-[35%]" : "w-[45%]"} />
                <col className="w-[10%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead>
                <tr className="bg-muted/60 border-b border-border/40">
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">التاريخ</th>
                  {expShowProp && <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">العقار / النشاط</th>}
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">الفئة</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">الملاحظات / البيان</th>
                  <th className="text-right text-[10px] font-semibold text-muted-foreground px-3 py-2">المبلغ</th>
                  <th className="text-center text-[10px] font-semibold text-muted-foreground px-2 py-2">إيصال</th>
                  <th className="w-[5%] px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((exp, idx) => {
                  const cat = catDisplayMap[exp.category] ?? { label: exp.category, emoji: "✨", colorClass: "bg-slate-100 text-slate-700" };
                  const displayLabel = exp.customCategory ? exp.customCategory : cat.label;
                  const displayDate = expCalType === "hijri"
                    ? formatDualDate(exp.dateStr).hijri.replace(/\s*هـ\s*$/, "") + " هـ"
                    : formatDualDate(exp.dateStr).gregorian;
                  const linkedService = expenseActivities.find(activity => activity.type === "service" && activity.id === exp.providerId);
                  const propName = exp.submissionId
                    ? ((mySubmissions as any[]).find((s) => s.id === exp.submissionId) as any)?.nameAr ?? "—"
                    : exp.providerId
                      ? linkedService?.type === "service" ? linkedService.name : "خدمة"
                      : "مصروف عام";
                  return (
                    <tr
                      key={exp.id}
                      className={`transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/20"} ${idx < filteredExpenses.length - 1 ? "border-b border-border/20" : ""}`}
                    >
                      <td className="text-right px-3 py-2.5">
                        <span className="text-[11px] font-semibold text-foreground whitespace-nowrap">{displayDate}</span>
                      </td>
                      {expShowProp && (
                        <td className="text-right px-3 py-2.5">
                          <span className="text-[10px] text-muted-foreground">{propName}</span>
                        </td>
                      )}
                      <td className="text-right px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${cat.colorClass}`}>
                          {cat.emoji} {displayLabel}
                        </span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <span className="text-[10px] text-muted-foreground line-clamp-2">{exp.notes || "—"}</span>
                      </td>
                      <td className="text-right px-3 py-2.5">
                        <p className="text-sm font-bold text-foreground leading-tight">{formatBankAmount(Number(exp.amount))}</p>
                        <p className="text-[9px] text-muted-foreground">ر.س</p>
                      </td>
                      <td className="text-center px-2 py-2.5">
                        {exp.receiptUrl ? (
                          <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/70 transition-colors inline-flex justify-center">
                            <Receipt className="w-4 h-4" />
                          </a>
                        ) : <span className="text-muted-foreground/30 text-xs">—</span>}
                      </td>
                      <td className="text-center px-2 py-2.5">
                        <button
                          onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } setDeleteConfirm({ open: true, expId: exp.id }); }}
                          className="text-muted-foreground hover:text-destructive transition-colors inline-flex justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
                  </table>
                </div>
                <PaginationBar
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  totalItems={filteredExpenses.length}
                  totalPages={pagination.totalPages}
                  onPageChange={pagination.goToPage}
                  onPageSizeChange={pagination.changePageSize}
                />
              </div>
            )}
          </PaginatedItems>
        )}

        {expenses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {expenseTotalLabel}
            </span>
            <span className="text-lg font-bold text-destructive"><bdi dir="ltr">{formatBankAmount(totalMonth)}</bdi> ⃁</span>
          </div>
        )}
      </div>

      {/* ── مودال تأكيد الحذف ── */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteConfirm({ open: false, expId: null })}
          />
          {/* Card */}
          <div className="relative z-10 w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
            {/* أيقونة التحذير */}
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-destructive" />
              </div>
            </div>
            {/* النص */}
            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-foreground">تأكيد الحذف</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                هل أنت متأكد من رغبتك في حذف هذا المصروف؟
                <br />
                <span className="text-destructive/80 font-medium text-xs">لا يمكن التراجع عن هذا الإجراء</span>
              </p>
            </div>
            {/* الأزرار */}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm({ open: false, expId: null })}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-muted/60 hover:bg-muted text-sm font-semibold text-foreground transition-colors"
              >
                تراجع
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.expId !== null) deleteMutation.mutate(deleteConfirm.expId);
                  setDeleteConfirm({ open: false, expId: null });
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-destructive hover:bg-destructive/90 text-sm font-semibold text-white transition-colors shadow-sm"
              >
                نعم، حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
