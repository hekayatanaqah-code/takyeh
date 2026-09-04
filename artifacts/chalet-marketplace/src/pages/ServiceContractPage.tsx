import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { AlertCircle, CheckCircle, Eraser, FileText, Loader2, PenLine, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDualDate } from "@/lib/hijri";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const toAr = (value: unknown) => String(value ?? "").replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);

type ServiceContract = {
  id: number;
  clientName: string;
  clientPhone: string | null;
  serviceAddress: string | null;
  serviceDeliveryMethod: string | null;
  notes: string | null;
  dateStr: string;
  duration: string | null;
  durationUnit: string;
  amount: string | null;
  status: string;
  cancelledAt: string | null;
  contractSigned: boolean;
  contractSignatureDataUrl: string | null;
  contractSignedAt: string | null;
  businessName: string;
  city: string;
  whatsappNumber: string;
  logoUrl: string | null;
  contractText: string | null;
  includeElectronicSignature: boolean;
};

function durationLabel(contract: ServiceContract) {
  if (!contract.duration) return "—";
  const n = toAr(contract.duration);
  if (contract.durationUnit === "days") return `${n} ${Number(contract.duration) === 1 ? "يوم" : "أيام"}`;
  return `${n} ${Number(contract.duration) === 1 ? "ساعة" : "ساعات"}`;
}

export default function ServiceContractPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [contract, setContract] = useState<ServiceContract | null>(null);
  const [error, setError] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    fetch(`${BASE}/api/providers/service-contract/${appointmentId}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "تعذّر تحميل العقد");
        setContract(data);
      })
      .catch(e => setError(e.message));
  }, [appointmentId]);

  useEffect(() => {
    if (!contract || new URLSearchParams(window.location.search).get("print") !== "1") return;
    let disposed = false;
    const printAfterAssetsLoad = async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(images.map(image => image.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          })));
      if (!disposed) window.setTimeout(() => window.print(), 100);
    };
    void printAfterAssetsLoad();
    return () => { disposed = true; };
  }, [contract]);

  if (error) return <main dir="rtl" className="min-h-screen bg-muted/30 flex items-center justify-center p-5"><div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center"><AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" /><h1 className="font-bold text-lg">تعذّر فتح العقد</h1><p className="text-sm text-muted-foreground mt-2">{error}</p></div></main>;
  if (!contract) return <main className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></main>;

  const dual = formatDualDate(contract.dateStr);
  const cancelled = contract.status === "cancelled" || !!contract.cancelledAt;

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!contract || contract.contractSigned || cancelled) return;
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const point = canvasPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2a2018";
    drawingRef.current = true;
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const point = canvasPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setSignError("");
  }

  async function confirmSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) {
      setSignError("يرجى رسم توقيعك أولاً.");
      return;
    }
    setSigning(true);
    setSignError("");
    try {
      const response = await fetch(`${BASE}/api/providers/service-contract/${appointmentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: canvas.toDataURL("image/png") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر حفظ التوقيع");
      setContract(current => current ? { ...current, ...data } : current);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : "تعذّر حفظ التوقيع");
    } finally {
      setSigning(false);
    }
  }

  return (
    <main dir="rtl" className="service-contract-print-page min-h-screen bg-[#f7f3ee] py-8 px-4 text-[#2a2018]">
      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          html, body, #root {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .service-contract-print-page {
            display: block !important;
            width: 100% !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            color: #2a2018 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .service-contract-print-wrap {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .service-contract-print-article {
            display: block !important;
            width: 100% !important;
            overflow: visible !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .service-contract-print-article,
          .service-contract-print-article * {
            visibility: visible !important;
          }
          .service-contract-print-article header,
          .service-contract-print-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .service-contract-signature-image {
            display: block !important;
            max-height: 42mm !important;
            object-fit: contain !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
      <div className="service-contract-print-wrap max-w-2xl mx-auto">
        <div className="flex justify-end mb-3 print:hidden">
          <Button variant="outline" className="rounded-xl gap-2 bg-white" onClick={() => window.print()}><Printer className="w-4 h-4" />طباعة العقد</Button>
        </div>
        <article className="service-contract-print-article bg-white rounded-2xl border border-[#e3d9cf] overflow-hidden shadow-sm print:shadow-none">
          <header className="bg-[#8b5e2b] text-white text-center p-5">
            <p className="text-2xl font-black">تكية</p>
            <p className="text-sm mt-1">عقد تقديم خدمة رقمي</p>
          </header>
          <section className="flex items-center gap-4 p-5 bg-[#fdf9f6] border-b border-[#e3d9cf]">
            {contract.logoUrl ? <img src={contract.logoUrl} alt={`شعار ${contract.businessName}`} className="w-20 h-20 rounded-xl object-contain bg-white border border-[#e3d9cf] p-1" /> : <div className="w-20 h-20 rounded-xl bg-[#8b5e2b]/10 flex items-center justify-center"><FileText className="w-8 h-8 text-[#8b5e2b]/50" /></div>}
            <div className="flex-1"><h1 className="text-xl font-bold">{contract.businessName}</h1><p className="text-sm text-[#75604a] mt-1">{contract.city}</p></div>
            <div className="text-left"><p className="text-xs text-[#75604a]">رقم العقد</p><p className="text-xl font-black text-[#8b5e2b]">#{toAr(contract.id)}</p></div>
          </section>
          {cancelled && <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-3 text-center font-bold text-red-600">هذا العقد مرتبط بحجز ملغى</div>}
          <section className="grid grid-cols-2 border-b border-[#e3d9cf]">
            <div className="p-5"><p className="text-xs font-bold text-[#8b5e2b]">الطرف الأول — مقدم الخدمة</p><p className="font-bold mt-2">{contract.businessName}</p><p className="text-sm text-[#75604a]" dir="ltr">{contract.whatsappNumber}</p></div>
            <div className="p-5 border-r border-[#e3d9cf]"><p className="text-xs font-bold text-emerald-700">الطرف الثاني — العميل</p><p className="font-bold mt-2">{contract.clientName}</p><p className="text-sm text-[#75604a]" dir="ltr">{contract.clientPhone ?? "—"}</p></div>
          </section>
          <section className="p-5 border-b border-[#e3d9cf]">
            <h2 className="text-xs font-bold text-[#75604a] mb-3">تفاصيل الحجز</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-[#fdf9f6] p-3"><span className="text-[#75604a]">التاريخ: </span><b>{dual.gregorian}</b><p className="text-xs text-[#75604a] mt-1">{dual.hijri}</p></div>
              <div className="rounded-xl bg-[#fdf9f6] p-3"><span className="text-[#75604a]">المدة: </span><b>{durationLabel(contract)}</b></div>
              {contract.serviceAddress && <div className="rounded-xl bg-[#fdf9f6] p-3 sm:col-span-2"><span className="text-[#75604a]">موقع تقديم الخدمة: </span><b>{contract.serviceAddress}</b></div>}
              <div className="rounded-xl bg-[#fdf9f6] p-3 sm:col-span-2"><span className="text-[#75604a]">طريقة تقديم الخدمة: </span><b>{contract.serviceDeliveryMethod === "customer_pickup" ? "استلام العميل من المقر" : contract.serviceDeliveryMethod === "delivery_installation" ? "توصيل وتركيب بموقع العميل" : "—"}</b></div>
              <div className="rounded-xl bg-[#fdf9f6] p-3 sm:col-span-2"><span className="text-[#75604a]">تفاصيل وملاحظات الخدمة: </span><b>{contract.notes || "—"}</b></div>
              {contract.amount && Number(contract.amount) > 0 && <div className="rounded-xl bg-[#fdf9f6] p-3 sm:col-span-2"><span className="text-[#75604a]">قيمة الخدمة: </span><b className="text-[#8b5e2b]">{toAr(Number(contract.amount).toLocaleString("en"))} ر.س</b></div>}
            </div>
          </section>
          <section className="p-5 border-b border-[#e3d9cf]"><h2 className="text-xs font-bold text-[#75604a] mb-3">الشروط والأحكام</h2><div className="text-sm leading-8 whitespace-pre-wrap">{contract.contractText?.trim() || "لا توجد شروط وأحكام مضافة."}</div></section>
          {contract.includeElectronicSignature && (
            <section className="p-5">
              <h2 className="text-xs font-bold text-[#75604a] mb-3">التوقيع الإلكتروني</h2>
              {contract.contractSigned ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3 text-emerald-700"><CheckCircle className="w-5 h-5" /><b>تم توقيع العقد إلكترونياً</b></div>
                  {contract.contractSignatureDataUrl && <img src={contract.contractSignatureDataUrl} alt="توقيع العميل" className="service-contract-signature-image w-full h-40 object-contain rounded-xl border border-[#e3d9cf] bg-[#fdf9f6]" />}
                  {contract.contractSignedAt && <p className="text-xs text-[#75604a] text-center">تاريخ التوقيع: {new Date(contract.contractSignedAt).toLocaleString("ar-SA")}</p>}
                </div>
              ) : cancelled ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 font-bold">لا يمكن توقيع عقد حجز ملغى.</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><PenLine className="w-4 h-4 text-[#8b5e2b]" />ارسم توقيعك داخل المربع</div>
                  <canvas
                    ref={canvasRef}
                    width={900}
                    height={280}
                    className="w-full h-44 rounded-xl border-2 border-dashed border-[#cdbca9] bg-[#fdf9f6] touch-none cursor-crosshair"
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerCancel={stopDrawing}
                  />
                  {signError && <p className="text-sm text-red-600">{signError}</p>}
                  <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <Button type="button" variant="outline" className="rounded-xl gap-2" disabled={signing} onClick={clearSignature}><Eraser className="w-4 h-4" />مسح</Button>
                    <Button type="button" className="rounded-xl gap-2 flex-1 bg-[#8b5e2b] hover:bg-[#754d23] text-white" disabled={signing || !hasSignature} onClick={confirmSignature}>{signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}تأكيد التوقيع</Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </article>
      </div>
    </main>
  );
}