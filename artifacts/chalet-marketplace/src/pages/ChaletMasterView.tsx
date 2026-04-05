import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ChaletMasterView() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["chalet-master", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  if (isLoading) return <p style={{ fontSize: 24, fontWeight: "bold" }}>جاري التحميل...</p>;
  if (error || !data) return <p style={{ fontSize: 24, fontWeight: "bold" }}>خطأ في التحميل</p>;

  return (
    <div style={{ padding: 32, direction: "rtl" }}>

      <p style={{ fontSize: 32, fontWeight: "bold" }}>
        اسم الشاليه: {data.nameAr}
      </p>

      <p style={{ fontSize: 28, fontWeight: "bold", marginTop: 32 }}>
        إنستغرام: {data.socialLink ?? "لا يوجد"}
      </p>

      <p style={{ fontSize: 24, fontWeight: "bold", marginTop: 32, whiteSpace: "pre-wrap" }}>
        الشروط الخاصة:{"\n"}{data.termsAndConditions ?? "لا توجد شروط"}
      </p>

    </div>
  );
}
