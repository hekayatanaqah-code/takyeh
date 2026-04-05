import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function hijriLine(date: Date) {
  const day = date.toLocaleDateString("ar-SA-u-ca-islamic", { weekday: "long" });
  const hijri = date.toLocaleDateString("ar-SA-u-ca-islamic", {
    year: "numeric", month: "numeric", day: "numeric",
  });
  const greg = date.toLocaleDateString("ar-SA", {
    year: "numeric", month: "numeric", day: "numeric",
  });
  return `${day} ${hijri} هـ (${greg} م)`;
}

export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: chalet, isLoading, error } = useQuery({
    queryKey: ["chalet", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  if (isLoading) return <p>جاري التحميل...</p>;
  if (error || !chalet) return <p>حدث خطأ أو الشاليه غير موجود</p>;

  const photos: string[] = Array.isArray(chalet.photos) ? chalet.photos : [];
  const today = new Date();

  return (
    <div dir="rtl" style={{ padding: 24, fontFamily: "sans-serif", lineHeight: 2 }}>

      <p><strong>اسم الشاليه:</strong> {chalet.nameAr}</p>

      <p><strong>الوصف:</strong> {chalet.descriptionAr}</p>

      <hr />

      <p><strong>الشروط الخاصة:</strong></p>
      {chalet.termsAndConditions ? (
        <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 16px" }}>
          {chalet.termsAndConditions}
        </pre>
      ) : (
        <p>(لا توجد شروط)</p>
      )}

      <hr />

      <p><strong>إنستغرام:</strong>{" "}
        {chalet.socialLink
          ? <a href={chalet.socialLink} target="_blank" rel="noreferrer">{chalet.socialLink}</a>
          : "(غير متوفر)"}
      </p>

      <hr />

      <p><strong>الأسعار:</strong></p>
      <p>صباحي: {chalet.priceMorning ?? "(—)"} ر.س</p>
      <p>مسائي: {chalet.priceEvening ?? "(—)"} ر.س</p>
      <p>يوم كامل: {chalet.priceFullDay ?? "(—)"} ر.س</p>
      <p>وسط الأسبوع: {chalet.priceWeekday ?? "(—)"} ر.س</p>
      <p>نهاية الأسبوع: {chalet.priceWeekend ?? "(—)"} ر.س</p>

      <hr />

      <p><strong>التاريخ اليوم:</strong> {hijriLine(today)}</p>

      <hr />

      <p><strong>أول 3 صور:</strong></p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {photos.slice(0, 3).map((url: string, i: number) => (
          <img
            key={i}
            src={`${BASE}${url}`}
            alt={`صورة ${i + 1}`}
            style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 4 }}
          />
        ))}
        {photos.length === 0 && <p>(لا توجد صور)</p>}
      </div>

    </div>
  );
}
