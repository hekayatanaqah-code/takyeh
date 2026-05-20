import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "wouter";
import { Loader2, CheckCircle, AlertCircle, Pen, Trash2, Printer, FileText } from "lucide-react";
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
  chaletLocation?: string | null;
  chaletWhatsapp?: string | null;
  chaletLogoUrl?: string | null;
  contractTerms?: string | null;
  bookingDate: string;
  durationDays: number;
  period: string | null;
  totalPrice: string | null;
  depositPaid: string | null;
  insuranceFee: string | null;
  contractSigned: boolean;
  contractSignerName: string | null;
  contractSignerId: string | null;
  contractSignatureDataUrl: string | null;
  contractSignedAt: string | null;
}

interface SignedData {
  signerName: string;
  signerId: string;
  signatureDataUrl: string;
}

function periodLabel(p: string | null) {
  if (!p) return "";
  if (p === "morning") return "صباحي";
  if (p === "evening") return "مسائي";
  if (p === "full_day" || p === "full") return "يوم كامل";
  return p;
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-medium text-right ${highlight ? "text-primary font-bold" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function printContract() {
  window.print();
}

function ContractLetterhead({
  booking,
  signedData,
  signedAtFormatted,
}: {
  booking: ContractBooking;
  signedData: SignedData;
  signedAtFormatted: string | null;
}) {
  const dualDate = formatDualDate(booking.bookingDate);
  const fmtM = (v: string | null) => (v ? toAr(Math.round(Number(v)).toLocaleString("en")) : "—");

  return (
    <div className="contract-print-area bg-white rounded-2xl border border-border shadow-sm overflow-hidden text-right" dir="rtl">
      {/* Platform Header */}
      <div className="bg-primary px-6 py-4 text-center">
        <p className="text-2xl font-extrabold text-white tracking-tight">تكية</p>
        <p className="text-xs text-white/80 mt-0.5">عقد إيجار شاليه رقمي موقَّع</p>
      </div>

      {/* Chalet Identity */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-border bg-slate-50/70">
        {booking.chaletLogoUrl ? (
          <img
            src={booking.chaletLogoUrl}
            alt="شعار الشاليه"
            className="w-16 h-16 rounded-xl object-cover border border-border shadow-sm shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
            <FileText className="w-8 h-8 text-primary/50" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-foreground leading-tight">{booking.chaletName}</p>
          {booking.chaletLocation && (
            <p className="text-xs text-muted-foreground mt-0.5">📍 {booking.chaletLocation}</p>
          )}
          {booking.chaletWhatsapp && (
            <p className="text-xs text-muted-foreground" dir="ltr">📞 {booking.chaletWhatsapp}</p>
          )}
        </div>
        <div className="shrink-0 text-left">
          <p className="text-[10px] text-muted-foreground">رقم الحجز</p>
          <p className="text-lg font-extrabold text-primary">#{toAr(booking.id)}</p>
        </div>
      </div>

      {/* Parties */}
      <div className="grid grid-cols-2 divide-x-reverse divide-x border-b border-border">
        <div className="p-4 space-y-1">
          <p className="text-[10px] font-bold text-primary uppercase tracking-wide">الطرف الأول — المؤجِّر</p>
          <p className="text-sm font-semibold text-foreground">{booking.chaletName}</p>
          {booking.chaletWhatsapp && (
            <p className="text-xs text-muted-foreground" dir="ltr">{booking.chaletWhatsapp}</p>
          )}
        </div>
        <div className="p-4 space-y-1 border-r border-border">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">الطرف الثاني — المستأجِر</p>
          <p className="text-sm font-semibold text-foreground">{signedData.signerName || "—"}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">هوية: {signedData.signerId || "—"}</p>
        </div>
      </div>

      {/* Booking Details Table */}
      <div className="p-5 border-b border-border">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">تفاصيل الحجز</p>
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr className="border-b border-border/40">
              <td className="py-1.5 text-muted-foreground w-36">اسم المستأجر</td>
              <td className="py-1.5 font-semibold">{booking.clientName}</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="py-1.5 text-muted-foreground">تاريخ الوصول</td>
              <td className="py-1.5 font-semibold">
                {dualDate.hijri.replace(/\s*هـ\s*$/, "")}
                <span className="text-muted-foreground text-xs ms-1.5">({dualDate.gregorian})</span>
              </td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="py-1.5 text-muted-foreground">المدة والفترة</td>
              <td className="py-1.5">
                {toAr(booking.durationDays)} {booking.durationDays === 1 ? "يوم" : "أيام"}
                {booking.period && (
                  <span className="ms-1.5 text-primary font-medium">· {periodLabel(booking.period)}</span>
                )}
              </td>
            </tr>
            {booking.totalPrice && Number(booking.totalPrice) > 0 && (
              <tr className="border-b border-border/40 bg-primary/5">
                <td className="py-1.5 font-bold text-foreground">إجمالي الإيجار</td>
                <td className="py-1.5 font-bold text-primary">{fmtM(booking.totalPrice)} ر.س</td>
              </tr>
            )}
            {booking.depositPaid && Number(booking.depositPaid) > 0 && (
              <tr className="border-b border-border/40">
                <td className="py-1.5 text-muted-foreground">العربون المدفوع</td>
                <td className="py-1.5">{fmtM(booking.depositPaid)} ر.س</td>
              </tr>
            )}
            {booking.insuranceFee && Number(booking.insuranceFee) > 0 && (
              <tr>
                <td className="py-1.5 text-muted-foreground">مبلغ التأمين</td>
                <td className="py-1.5">{fmtM(booking.insuranceFee)} ر.س</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Terms & Conditions */}
      <div className="p-5 border-b border-border">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">الشروط والأحكام</p>
        {booking.contractTerms ? (
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{booking.contractTerms}</p>
        ) : (
          <ul className="text-xs text-foreground space-y-1 list-disc list-inside leading-relaxed">
            <li>يُلزَم المستأجر بالالتزام بمواعيد تسليم الشاليه المتفق عليها.</li>
            <li>مبلغ التأمين يُستردّ كاملاً في حالة عدم وجود أضرار.</li>
            <li>يُحظر التدخين وإقامة الحفلات داخل الشاليه.</li>
            <li>المستأجر مسؤول عن أي أضرار تحدث خلال فترة الإقامة.</li>
          </ul>
        )}
      </div>

      {/* Signature & ID */}
      <div className="p-5">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">التوقيع والإثبات</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">توقيع المستأجر</p>
            {signedData.signatureDataUrl ? (
              <div className="border border-emerald-200 rounded-xl overflow-hidden bg-slate-50">
                <img
                  src={signedData.signatureDataUrl}
                  alt="توقيع"
                  className="w-full object-contain max-h-28"
                />
              </div>
            ) : (
              <div className="h-20 border rounded-xl bg-slate-50 flex items-center justify-center text-xs text-muted-foreground">
                لا يوجد توقيع
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">بيانات الهوية</p>
            <div className="rounded-xl border border-border bg-slate-50 p-3 space-y-2">
              <div>
                <p className="text-[10px] text-muted-foreground">الاسم الكامل</p>
                <p className="text-sm font-semibold">{signedData.signerName || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">رقم الهوية / الإقامة</p>
                <p className="text-sm font-semibold" dir="ltr">{signedData.signerId || "—"}</p>
              </div>
            </div>
          </div>
        </div>
        {signedAtFormatted && (
          <p className="text-xs text-muted-foreground text-center mt-4 pt-3 border-t border-border">
            ✓ تاريخ التوقيع: {signedAtFormatted} · رقم الحجز: #{toAr(booking.id)}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ContractPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<ContractBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* alreadySigned = contract was signed before this session (loaded from DB) */
  const [alreadySigned, setAlreadySigned] = useState(false);
  /* justSigned = contract was signed just now in this session */
  const [justSigned, setJustSigned] = useState(false);
  /* signed data for display — populated from API (already signed) or form (just signed) */
  const [signedData, setSignedData] = useState<SignedData | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);
  const [sigError, setSigError] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    fetch(`${BASE}/api/owner/contract/${bookingId}`, { credentials: "include" })
      .then(r => r.json())
      .then((data: ContractBooking & { error?: string }) => {
        if (data.error) { setLoadError(data.error); }
        else {
          setBooking(data);
          if (data.contractSigned) {
            setAlreadySigned(true);
            setSignedData({
              signerName: data.contractSignerName ?? "",
              signerId: data.contractSignerId ?? "",
              signatureDataUrl: data.contractSignatureDataUrl ?? "",
            });
          }
        }
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
    if (!fullName.trim() || !idNumber.trim()) return;
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
      else {
        setSignedData({ signerName: fullName.trim(), signerId: idNumber.trim(), signatureDataUrl: sigDataUrl });
        setJustSigned(true);
      }
    } catch { setSubmitError("تعذّر الاتصال. تأكّد من الاتصال بالإنترنت وأعد المحاولة."); }
    finally { setSubmitting(false); }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  /* ── Error ── */
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

  const dualDate = formatDualDate(booking.bookingDate);
  const fmtMoney = (v: string | null) => v ? toAr(Math.round(Number(v)).toLocaleString("en")) : "—";
  const signedAtFormatted = (() => {
    if (!booking.contractSignedAt) return null;
    try {
      const d = formatDualDate(new Date(booking.contractSignedAt).toISOString().slice(0, 10));
      return `${d.hijri.replace(/\s*هـ\s*$/, "")} (${d.gregorian})`;
    } catch { return null; }
  })();

  /* ── Already Signed (re-opened by anyone) ── */
  if (alreadySigned && signedData) {
    return (
      <div className="min-h-screen bg-slate-50 pb-10" dir="rtl">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          {/* Status Banner */}
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center gap-3 contract-no-print">
            <CheckCircle className="w-7 h-7 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-800 text-base">هذا العقد تم توقيعه واعتماده بنجاح ✓</p>
              {signedAtFormatted && (
                <p className="text-xs text-emerald-700 mt-0.5">تاريخ التوقيع: {signedAtFormatted}</p>
              )}
            </div>
          </div>

          {/* Premium Letterhead */}
          <ContractLetterhead
            booking={booking}
            signedData={signedData}
            signedAtFormatted={signedAtFormatted}
          />

          {/* Print / Save as PDF */}
          <Button
            variant="outline"
            className="w-full h-11 font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-50 contract-no-print"
            onClick={printContract}
          >
            <Printer className="w-4 h-4 me-2" />
            🖨️ طباعة / حفظ كـ PDF
          </Button>
        </div>
      </div>
    );
  }

  /* ── Just Signed (fresh success) ── */
  if (justSigned && signedData) {
    return (
      <div className="min-h-screen bg-green-50 pb-10" dir="rtl">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          {/* Success Header */}
          <div className="text-center space-y-3 contract-no-print">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-green-800">تم اعتماد العقد ✓</h2>
            <p className="text-green-700 text-sm">تمّ توقيع عقد الإيجار بنجاح. يمكنك طباعته أو حفظه كـ PDF.</p>
          </div>

          {/* Premium Letterhead */}
          <ContractLetterhead
            booking={booking}
            signedData={signedData}
            signedAtFormatted={signedAtFormatted}
          />

          {/* Print CTA */}
          <Button
            className="w-full h-12 text-base font-bold rounded-xl bg-green-600 hover:bg-green-700 text-white contract-no-print"
            onClick={printContract}
          >
            <Printer className="w-5 h-5 me-2" />
            🖨️ طباعة / حفظ كـ PDF
          </Button>
          <p className="text-center text-xs text-muted-foreground pb-4 contract-no-print">
            اختر "حفظ كـ PDF" في نافذة الطباعة للاحتفاظ بنسخة وإرسالها عبر واتساب.
          </p>
        </div>
      </div>
    );
  }

  /* ── Unsigned Form ── */
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
