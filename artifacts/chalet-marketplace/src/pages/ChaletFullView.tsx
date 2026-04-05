import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ChaletFullView() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["chalet-fullview", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  if (isLoading) return <div style={{ padding: 32, direction: "rtl" }}>جاري التحميل...</div>;
  if (error || !data)  return <div style={{ padding: 32, direction: "rtl" }}>خطأ في التحميل</div>;

  const terms: string[] = (data.termsAndConditions ?? "")
    .split("\n")
    .map((t: string) => t.trim())
    .filter(Boolean);

  return (
    <div style={{ padding: 24, direction: "rtl", fontFamily: "sans-serif" }}>
      {/* PROOF THIS IS THE NEW FILE */}
      <p style={{ color: "red", fontWeight: "bold", fontSize: 18 }}>
        ✅ ChaletFullView.tsx — الملف الجديد يعمل
      </p>

      <h1 style={{ color: "red", fontSize: 24, marginTop: 16 }}>
        اسم الشاليه: {data.nameAr}
      </h1>

      {/* TERMS IN RED */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ color: "red", fontSize: 20 }}>شروط الشاليه (الشروط الخاصة):</h2>
        {terms.length === 0 ? (
          <p style={{ color: "red" }}>لا توجد شروط</p>
        ) : (
          <ul>
            {terms.map((t, i) => (
              <li key={i} style={{ color: "red", fontSize: 16, marginBottom: 6 }}>
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* INSTAGRAM IN RED */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ color: "red", fontSize: 20 }}>إنستغرام:</h2>
        {data.socialLink ? (
          <a href={data.socialLink} target="_blank" rel="noreferrer"
             style={{ color: "red", fontSize: 16, textDecoration: "underline" }}>
            {data.socialLink}
          </a>
        ) : (
          <p style={{ color: "red" }}>لا يوجد رابط إنستغرام</p>
        )}
      </div>
    </div>
  );
}
