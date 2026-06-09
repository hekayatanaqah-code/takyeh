export default function RealDialog() {
  return (
    <div className="min-h-screen bg-gray-700 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-black/80" />

      {/* Exact dialog.tsx wrapper: fixed inset-0 flex items-center justify-center p-4 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        {/* DialogContent: flex flex-col items-stretch max-h-[90vh] p-6 */}
        <div
          dir="rtl"
          className="pointer-events-auto relative flex flex-col items-stretch w-full max-w-sm max-h-[90vh] gap-4 border bg-white p-6 shadow-2xl rounded-xl"
        >
          {/* Close button */}
          <button className="absolute left-4 top-4 opacity-50 text-sm">✕</button>

          {/* DialogHeader — shrink-0 (fixed) */}
          <div className="flex flex-col space-y-1 text-right shrink-0">
            <h2 className="text-base font-bold">حجوزات ٢٥ ذو الحجة ١٤٤٧ هـ</h2>
            <p className="text-xs text-gray-400">الخميس، ١١ يونيو ٢٠٢٦</p>
          </div>

          {/* Scrollable content — flex-1 min-h-0 overflow-y-auto */}
          <div className="space-y-3 mt-1 w-full min-w-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {/* Blue card (evening booking) */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2 w-full">
              <p className="text-sm font-bold text-blue-900 text-right">🌙 الفترة المسائية</p>
              <div className="text-xs text-amber-800 bg-amber-50/80 rounded-lg px-2.5 py-1.5 text-center">
                يوم واحد · ٢٥ ذو الحجة ١٤٤٧ هـ
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-400">
                <span className="text-right">الاسم</span>
                <span className="font-semibold text-gray-900 text-left">حمود بن محمد</span>
                <span className="text-right">الجوال</span>
                <span className="font-semibold text-gray-900 text-left" dir="ltr">٠٥٠٤٩٠٥٤٧٧٦</span>
                <span className="text-right">الإجمالي</span>
                <span className="font-semibold text-gray-900 text-left">٣٣٠ ر.س</span>
                <span className="text-right">العربون</span>
                <span className="font-semibold text-gray-900 text-left">٢٥٠ ر.س</span>
                <span className="text-right">المتبقي</span>
                <span className="font-semibold text-orange-500 text-left">٨٠ ر.س</span>
                <span className="text-right">المصدر</span>
                <span className="font-semibold text-gray-900 text-left">خارجي</span>
              </div>

              {/* Insurance */}
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-green-700">مستلم (كاش)</span>
                  <span className="font-bold text-orange-700">١٠٠ ر.س 🔒 مبلغ التأمين</span>
                </div>
                <button className="w-full text-center py-1.5 border border-orange-200 rounded-lg text-orange-600 text-[11px]">🏦 تسجيل إيداع التأمين بالبنك</button>
              </div>

              {/* Cash deposit */}
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <button className="text-[11px] font-bold text-white bg-green-600 rounded-lg px-2.5 py-1.5">✓ تم الإيداع</button>
                  <div className="text-right">
                    <p className="font-semibold text-green-800">🏦 تم الإيداع في البنك</p>
                    <p className="text-green-600 text-[10px]">المبلغ مُحوَّل للبنك ✓</p>
                  </div>
                </div>
              </div>

              {/* Contract */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                <span className="text-purple-600 font-semibold bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">⏳ بانتظار توقيع المستأجر</span>
                <span className="text-gray-500">حالة العقد</span>
              </div>

              {/* Action buttons inside card */}
              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-gray-100">
                <button className="col-span-2 flex items-center justify-center gap-1 text-xs py-2 border border-orange-200 rounded-lg text-orange-700">🔒 إدارة التأمين</button>
                <button className="text-[11px] py-2 border border-gray-200 rounded-lg text-gray-600 text-center">📄 نسخ رابط العقد</button>
                <button className="text-[11px] py-2 border border-green-200 rounded-lg text-green-700 text-center">📩 إرسال العقد بالواتساب</button>
                <button className="text-[11px] py-2 border border-teal-200 rounded-lg text-teal-700 text-center">⭐ إرسال رابط التقييم</button>
                <button className="text-[11px] py-2 border border-blue-200 rounded-lg text-blue-700 text-center">✚ إضافة دفعة</button>
                <button className="col-span-2 flex items-center justify-center gap-1 text-xs py-2 border border-red-200 rounded-lg text-red-600">✖ إلغاء</button>
                <button className="col-span-2 flex items-center justify-center gap-1 text-xs py-2 border border-primary/30 rounded-lg text-primary">↺ إعادة جدولة</button>
              </div>
            </div>
          </div>

          {/* DialogFooter — shrink-0 (fixed at bottom) */}
          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex flex-row gap-2 w-full">
              <button className="flex-1 text-[11px] py-2.5 border border-primary/40 rounded-lg text-primary text-center">+ حجز الفترة الصباحية</button>
              <button className="flex-1 text-[11px] py-2.5 border border-orange-300 rounded-lg text-orange-700 text-center">⚙ إغلاق الفترة الصباحية</button>
            </div>
            <button className="w-full text-[11px] py-2.5 border border-gray-200 rounded-lg text-gray-500">إغلاق</button>
          </div>
        </div>
      </div>
    </div>
  );
}
