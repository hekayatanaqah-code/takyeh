import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Loader2, CheckCircle, AlertCircle, Pen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDualDate } from "@/lib/hijri";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const toAr = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

interface ContractBooking {
  id: number;
  clientName: string;
  chaletName: string;
  bookingDate: string;
  durationDays: number;
  period: string | null;
  totalPrice: string | null;
  depositPaid: string | null;
  insuranceFee: string | null;
  contractSigned: boolean;
}

function periodLabel(p: string | null) {
  if (!p) return "";
  if (p === "morning") return "صباحي";
  if (p === "evening") return "مسائي";
  if (p === "full") return "يوم كامل";
  return p;
}

export default function ContractPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<ContractBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);
  const [sigError, setSigError] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    fetch(`${BASE}/api/owner/contract/${bookingId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); }
        else { setBooking(data); if (data.contractSigned) setSubmitted(true); }
        setLoading(false);
      })
      .catch(() => { setLoadError("تعذّر تحميل بيانات العقد."); setLoading(false); });
  }, [bookingId]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setSigError(false);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasSig(true);
  }, []);

  const endDraw = useCallback(() => { isDrawing.current = false; }, []);

  const clearSig = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) return;
    if (!idNumber.trim()) return;
    if (!hasSig) { setSigError(true); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sigDataUrl = canvas.toDataURL("image/png");
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${BASE}/api/owner/contract/${bookingId}/sign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), idNumber: idNumber.trim(), signatureDataUrl: sigDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "حدث خطأ أثناء الحفظ."); }
      else { setSubmitted(true); }
    } catch { setSubmitError("تعذّر الاتصال. تأكّد من الاتصال بالإنترنت وأعد المحاولة."); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400" />
          <p className="font-semibold text-lg text-foreground">{loadError ?? "العقد غير موجود"}</p>
          <p className="text-sm text-muted-foreground">تحقّق من الرابط أو تواصل مع مالك العقار.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 p-6" dir="rtl">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-green-800">تم اعتماد العقد ✓</h2>
          <p className="text-green-700 text-sm">تمّ توقيع عقد الإيجار بنجاح. يمكنك إغلاق هذه النافذة الآن.</p>
          <div className="bg-white rounded-2xl border border-green-200 p-4 text-right space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">العقار</span>
              <span className="font-semibold">{booking.chaletName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">المستأجر</span>
              <span className="font-semibold">{booking.clientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">رقم الحجز</span>
              <span className="font-semibold">#{toAr(booking.id)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const dualDate = formatDualDate(booking.bookingDate);
  const fmtMoney = (v: string | null) => v ? toAr(Math.round(Number(v)).toLocaleString("en")) : "—";

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-3xl font-extrabold text-primary tracking-tight">تكية</div>
          <p className="text-sm text-muted-foreground">عقد إيجار شاليه — يرجى القراءة والتوقيع</p>
        </div>

        {/* Booking Summary Card */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-base text-foreground border-b border-border pb-2">تفاصيل الحجز</h2>
          <div className="space-y-2 text-sm">
            <Row label="العقار" value={booking.chaletName} />
            <Row label="المستأجر" value={booking.clientName} />
            <Row label="رقم الحجز" value={`#${toAr(booking.id)}`} />
            <Row
              label="تاريخ الوصول"
              value={
                <span>
                  {dualDate.hijri.replace(/\s*هـ\s*$/, "")}
                  <span className="text-muted-foreground ms-1 text-xs">({dualDate.gregorian})</span>
                </span>
              }
            />
            <Row
              label="المدة"
              value={`${toAr(booking.durationDays)} ${booking.durationDays === 1 ? "يوم" : "أيام"}${booking.period ? ` · ${periodLabel(booking.period)}` : ""}`}
            />
            {booking.totalPrice && (
              <Row label="إجمالي قيمة الإيجار" value={`${fmtMoney(booking.totalPrice)} ر.س`} highlight />
            )}
            {booking.depositPaid && Number(booking.depositPaid) > 0 && (
              <Row label="العربون المدفوع" value={`${fmtMoney(booking.depositPaid)} ر.س`} />
            )}
            {booking.insuranceFee && Number(booking.insuranceFee) > 0 && (
              <Row label="مبلغ التأمين" value={`${fmtMoney(booking.insuranceFee)} ر.س`} />
            )}
          </div>
        </div>

        {/* Policies */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <h3 className="font-bold text-sm text-amber-800">📋 الشروط والأحكام</h3>
          <ul className="text-xs text-amber-900 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>يُلزَم المستأجر بالالتزام بمواعيد تسليم الشاليه المتفق عليها.</li>
            <li>مبلغ التأمين يُستردّ كاملاً في حالة عدم وجود أضرار أو مخالفات.</li>
            <li>يُحظر إقامة الحفلات الصاخبة أو الأنشطة التي تُخل بالنظام العام.</li>
            <li>التدخين ممنوع داخل الشاليه بالكامل.</li>
            <li>في حالة الإلغاء، يُطبَّق نظام الاسترداد وفق سياسة مالك العقار.</li>
            <li>المستأجر مسؤول عن أي أضرار تحدث خلال فترة الإقامة.</li>
          </ul>
        </div>

        {/* Signer Info */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-base text-foreground">بيانات الموقِّع</h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الاسم الكامل *</label>
              <Input
                placeholder="أدخل اسمك الكامل"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="text-right"
                data-no-arabic
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">رقم الهوية / الإقامة *</label>
              <Input
                placeholder="١٠ أرقام"
                value={idNumber}
                onChange={e => setIdNumber(e.target.value)}
                className="text-right"
                inputMode="numeric"
                data-no-arabic
              />
            </div>
          </div>
        </div>

        {/* Signature Pad */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground flex items-center gap-2">
              <Pen className="w-4 h-4 text-primary" />
              التوقيع بالإصبع
            </h2>
            <button
              type="button"
              onClick={clearSig}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              مسح التوقيع
            </button>
          </div>
          <div
            className={`rounded-xl border-2 overflow-hidden ${sigError ? "border-red-400" : hasSig ? "border-green-400" : "border-dashed border-slate-300"}`}
            style={{ touchAction: "none" }}
          >
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full bg-slate-50 cursor-crosshair"
              style={{ display: "block" }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          {sigError && <p className="text-xs text-red-500">يرجى رسم توقيعك أولاً.</p>}
          {!hasSig && !sigError && (
            <p className="text-xs text-muted-foreground text-center">اسحب بإصبعك داخل المستطيل أعلاه للتوقيع</p>
          )}
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {submitError}
          </div>
        )}

        <Button
          className="w-full h-12 text-base font-bold rounded-xl bg-primary hover:bg-primary/90"
          onClick={handleSubmit}
          disabled={submitting || !fullName.trim() || !idNumber.trim()}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin me-2" /> : null}
          اعتماد وتوقيع العقد
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-4">
          بالضغط على الزر أعلاه، تقرّ بأنك قرأت الشروط والأحكام ووافقت عليها.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-medium text-right ${highlight ? "text-primary font-bold" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
