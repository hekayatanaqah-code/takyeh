import { ContractLetterhead, type ContractBooking } from "@/pages/ContractPage";

/** Uses the customer's actual contract renderer, without creating a booking or a signature. */
export function PropertyContractPreview({ property, logoUrl }: {
  property: {
    nameAr?: string; termsAndConditions?: string | null;
    location?: string | null; district?: string | null; whatsappNumber?: string | null;
    morningCheckIn?: string | null; morningCheckOut?: string | null;
    eveningCheckIn?: string | null; eveningCheckOut?: string | null;
    fullDayCheckIn?: string | null; fullDayCheckOut?: string | null;
  };
  logoUrl: string;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const booking: ContractBooking = {
    id: 123, clientName: "اسم المستأجر — نموذج توضيحي", clientPhone: null,
    chaletName: property.nameAr || "اسم العقار", chaletLocation: property.location,
    chaletDistrict: property.district, chaletWhatsapp: property.whatsappNumber,
    chaletLogoUrl: logoUrl || null, contractTerms: property.termsAndConditions,
    bookingDate: today, durationDays: 1, period: "full_day",
    totalPrice: "1200", depositPaid: "300", insuranceFee: "200", insuranceReceived: false,
    contractSigned: false, contractSignerName: null, contractSignerId: null,
    contractSignatureDataUrl: null, contractSignedAt: null, prevSignerName: null, prevSignerId: null,
    morningCheckIn: property.morningCheckIn ?? null, morningCheckOut: property.morningCheckOut ?? null,
    eveningCheckIn: property.eveningCheckIn ?? null, eveningCheckOut: property.eveningCheckOut ?? null,
    fullDayCheckIn: property.fullDayCheckIn ?? null, fullDayCheckOut: property.fullDayCheckOut ?? null,
  };
  return (
    <div data-testid="property-contract-preview" className="min-w-0 space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium leading-7 text-amber-950">
        نموذج توضيحي بتاريخ اليوم بتوقيت السعودية، وبالشعار والشروط الحالية للعقار. الاسم والمبالغ أمثلة فقط؛ لا يُنشأ حجز أو توقيع ولا تُرسل رسالة.
      </p>
      <ContractLetterhead booking={booking}
        signedData={{ signerName: booking.clientName, signerId: "", signatureDataUrl: "" }}
        signedAtFormatted={null} />
    </div>
  );
}
