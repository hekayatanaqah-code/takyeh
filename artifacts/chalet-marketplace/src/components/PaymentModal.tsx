import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Crown, CheckCircle2, Download, Loader2, AlertTriangle, CreditCard,
  Calendar, ShieldCheck, Star, Building2, Package, Zap,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { credentials: "include", ...opts });
}

/* ── Plan types ── */
interface Plan {
  id: string;
  label: string;
  price: number;
  days: number;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  monthly:          <Package className="w-5 h-5 text-indigo-500" />,
  yearly:           <Crown className="w-5 h-5 text-amber-500" />,
  chalet_basic:     <Building2 className="w-5 h-5 text-green-500" />,
  chalet_pro:       <Zap className="w-5 h-5 text-violet-500" />,
  chalet_unlimited: <Crown className="w-5 h-5 text-rose-500" />,
  service_basic:    <Star className="w-5 h-5 text-teal-500" />,
  service_pro:      <Zap className="w-5 h-5 text-cyan-500" />,
  bundle:           <Crown className="w-5 h-5 text-orange-500" />,
};

const POPULAR_PLANS = ["monthly", "yearly"];

interface Invoice {
  paymentId: string;
  plan: string;
  label: string;
  amount: number;
  currency: string;
  paidAt: string;
  expiresAt: string;
  ownerName: string;
}

/* ── Invoice PDF generator (pure JS / canvas) ── */
function downloadInvoice(inv: Invoice) {
  const lines = [
    `فاتورة إلكترونية — حكاية أناقة`,
    ``,
    `رقم الدفعة: ${inv.paymentId}`,
    `الاسم: ${inv.ownerName}`,
    `الخطة: ${inv.label}`,
    `المبلغ: ${inv.amount} ${inv.currency}`,
    `تاريخ الدفع: ${new Date(inv.paidAt).toLocaleDateString("ar-SA")}`,
    `صالح حتى: ${new Date(inv.expiresAt).toLocaleDateString("ar-SA")}`,
    ``,
    `شكراً لاشتراكك في منصة حكاية أناقة`,
  ];

  const canvas = document.createElement("canvas");
  canvas.width = 680;
  canvas.height = 420;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f9f5f1";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#b5895a";
  ctx.fillRect(0, 0, canvas.width, 10);
  ctx.fillRect(0, canvas.height - 10, canvas.width, 10);

  ctx.font = "bold 22px serif";
  ctx.fillStyle = "#3b2a1a";
  ctx.textAlign = "center";
  ctx.fillText("فاتورة إلكترونية — حكاية أناقة", canvas.width / 2, 50);

  ctx.font = "16px serif";
  ctx.textAlign = "right";
  lines.slice(2).forEach((line, i) => {
    ctx.fillStyle = line.startsWith("ر") || line.startsWith("ا") || line.startsWith("خ") || line.startsWith("م") || line.startsWith("ت") || line.startsWith("ص") ? "#222" : "#555";
    ctx.fillText(line, canvas.width - 40, 100 + i * 28);
  });

  ctx.font = "13px serif";
  ctx.fillStyle = "#999";
  ctx.textAlign = "center";
  ctx.fillText("شكراً لاشتراكك في منصة حكاية أناقة", canvas.width / 2, canvas.height - 30);

  const link = document.createElement("a");
  link.download = `invoice-${inv.paymentId.slice(0, 8)}.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ── Moyasar script loader ── */
function useMoyasarScript() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ((window as any).Moyasar) { setReady(true); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}

/* ── Main Modal ── */
interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  currentPlan?: string;
}

type Step = "plan" | "pay" | "success";

export function PaymentModal({ open, onClose, currentPlan }: PaymentModalProps) {
  const qc = useQueryClient();
  const scriptReady = useMoyasarScript();
  const formContainerRef = useRef<HTMLDivElement>(null);
  const moyasarInstance = useRef<any>(null);

  const [step, setStep] = useState<Step>("plan");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [initiateData, setInitiateData] = useState<{ publishableKey: string; amountHalala: number } | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  /* Load plans */
  useEffect(() => {
    if (!open) return;
    apiFetch("/owner/plans").then(r => r.json()).then(setPlans).catch(() => {});
  }, [open]);

  /* Reset on close */
  useEffect(() => {
    if (!open) {
      setStep("plan");
      setSelectedPlan(null);
      setInitiateData(null);
      setInvoice(null);
      setPayError(null);
      setPaying(false);
      moyasarInstance.current = null;
    }
  }, [open]);

  /* Confirm payment mutation */
  const confirmMutation = useMutation({
    mutationFn: async ({ paymentId, plan }: { paymentId: string; plan: string }) => {
      const r = await apiFetch("/owner/subscription/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, plan }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "فشل تأكيد الدفع");
      return data as { subscription: any; invoice: Invoice };
    },
    onSuccess: (data) => {
      setInvoice(data.invoice);
      setStep("success");
      setPaying(false);
      qc.invalidateQueries({ queryKey: ["owner", "subscription"] });
      qc.invalidateQueries({ queryKey: ["owner", "subscription-header"] });
      qc.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
    },
    onError: (err: Error) => {
      setPayError(err.message);
      setPaying(false);
    },
  });

  /* Mount Moyasar form when we enter pay step */
  useEffect(() => {
    if (step !== "pay" || !scriptReady || !initiateData || !formContainerRef.current) return;
    const Moyasar = (window as any).Moyasar;
    if (!Moyasar) return;

    const container = formContainerRef.current;
    container.innerHTML = ""; // clear any previous instance

    const plan = selectedPlan!;

    moyasarInstance.current = Moyasar.init({
      element: container,
      amount: initiateData.amountHalala,
      currency: "SAR",
      description: `${plan.label} — حكاية أناقة`,
      publishable_api_key: initiateData.publishableKey,
      callback_url: window.location.href, // not used (we handle success ourselves)
      on_completed: (payment: any) => {
        if (payment.status === "paid") {
          setPaying(true);
          confirmMutation.mutate({ paymentId: payment.id, plan: plan.id });
        } else {
          setPayError(`لم يكتمل الدفع — الحالة: ${payment.status}`);
        }
        return false; // prevent default redirect
      },
      supported_networks: ["mada", "visaMastercard", "stcpay", "applepay"],
      language: "ar",
    });

    return () => {
      container.innerHTML = "";
      moyasarInstance.current = null;
    };
  }, [step, scriptReady, initiateData]);

  /* Step 1: Select a plan */
  async function handleSelectPlan(p: Plan) {
    setSelectedPlan(p);
    setPayError(null);
    const r = await apiFetch("/owner/subscription/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: p.id }),
    });
    const data = await r.json();
    if (!r.ok) { setPayError(data.error); return; }
    setInitiateData({ publishableKey: data.publishableKey, amountHalala: data.amountHalala });
    setStep("pay");
  }

  /* ─── UI ─── */
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !paying) onClose(); }}>
      <DialogContent
        className="max-w-lg rounded-3xl p-0 overflow-hidden"
        dir="rtl"
        style={{ fontFamily: "inherit" }}
      >

        {/* ── Step: Plan Selection ── */}
        {step === "plan" && (
          <>
            <DialogHeader className="p-6 pb-2 bg-gradient-to-br from-primary/10 to-background">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                اختر خطتك
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                اشتراك بدون عمولة — سعر ثابت فقط
              </DialogDescription>
            </DialogHeader>
            <div className="p-5 grid gap-2 max-h-[65vh] overflow-y-auto">
              {plans.length === 0 && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {plans.map((p) => {
                const isPopular = POPULAR_PLANS.includes(p.id);
                const isCurrent = p.id === currentPlan;
                return (
                  <button
                    key={p.id}
                    onClick={() => !isCurrent && handleSelectPlan(p)}
                    disabled={isCurrent}
                    className={`w-full text-start rounded-2xl border-2 p-4 flex items-center gap-3 transition-all cursor-pointer hover:border-primary/70 hover:bg-primary/5 disabled:opacity-60 disabled:cursor-default ${
                      isCurrent ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="shrink-0">{PLAN_ICONS[p.id] ?? <Package className="w-5 h-5" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-sm">{p.label}</span>
                        {isPopular && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">الأكثر شعبية</span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">خطتك الحالية</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.days} يوم</p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="font-black text-lg text-foreground">{p.price}</p>
                      <p className="text-xs text-muted-foreground">ر.س</p>
                    </div>
                  </button>
                );
              })}
              {payError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3 mt-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {payError}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step: Payment Form ── */}
        {step === "pay" && selectedPlan && (
          <>
            <DialogHeader className="p-6 pb-2 bg-gradient-to-br from-primary/10 to-background">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                إتمام الدفع
              </DialogTitle>
              <DialogDescription>
                <span className="font-semibold">{selectedPlan.label}</span>
                {" — "}
                <span className="font-black text-foreground">{selectedPlan.price} ر.س</span>
                {" لمدة "}
                <span>{selectedPlan.days} يوم</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-5 space-y-4">
              {/* Moyasar form mount point */}
              {!scriptReady && (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">جارٍ تحميل بوابة الدفع...</span>
                </div>
              )}
              <div ref={formContainerRef} id="moyasar-form" />

              {paying && (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">جارٍ تأكيد الدفع وتفعيل الاشتراك...</span>
                </div>
              )}
              {payError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {payError}
                </div>
              )}

              {/* Test card note */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl p-3">
                <ShieldCheck className="w-4 h-4 shrink-0 text-green-500 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">وضع الاختبار (Test Mode)</span>
                  <br />
                  استخدم رقم البطاقة: <span className="font-mono text-foreground">4111 1111 1111 1111</span> / أي تاريخ مستقبلي / أي CVC
                  <br />
                  لبطاقة mada: <span className="font-mono text-foreground">5588 4817 3519 6601</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => { setStep("plan"); setPayError(null); }}
                disabled={paying}
              >
                العودة لاختيار الخطة
              </Button>
            </div>
          </>
        )}

        {/* ── Step: Success ── */}
        {step === "success" && invoice && (
          <div className="p-8 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">تم الدفع بنجاح! 🎉</h2>
              <p className="text-sm text-muted-foreground mt-1">اشتراكك الآن نشط</p>
            </div>

            <div className="w-full bg-card border border-border rounded-2xl p-4 text-sm text-start space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الخطة</span>
                <span className="font-semibold">{invoice.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المبلغ المدفوع</span>
                <span className="font-bold text-green-700">{invoice.amount} {invoice.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تاريخ الدفع</span>
                <span className="font-medium">{new Date(invoice.paidAt).toLocaleDateString("ar-SA")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  صالح حتى
                </span>
                <span className="font-semibold text-primary">
                  {new Date(invoice.expiresAt).toLocaleDateString("ar-SA")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">رقم المرجع</span>
                <span className="font-mono text-xs text-muted-foreground">{invoice.paymentId.slice(0, 16)}...</span>
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <Button
                className="flex-1 rounded-xl gap-2"
                onClick={() => downloadInvoice(invoice)}
              >
                <Download className="w-4 h-4" />
                تحميل الفاتورة
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={onClose}
              >
                إغلاق
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
