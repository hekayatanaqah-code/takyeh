import { useQuery } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Privacy() {
  const { data, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const content = data?.privacy_page_content ?? "";

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground">سياسة الخصوصية</h1>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : content ? (
            <div className="bg-card border border-border rounded-2xl p-8">
              <p className="text-foreground leading-loose whitespace-pre-wrap text-[15px]">{content}</p>
            </div>
          ) : (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
              <p className="text-muted-foreground">سيتم إضافة سياسة الخصوصية قريباً.</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
