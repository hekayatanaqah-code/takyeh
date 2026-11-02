import { useQuery } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { InformationalContent } from "@/components/layout/InformationalContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Privacy() {
  const { data: content = "", isLoading, isError, isFetching, refetch } = useQuery<string>({
    // Keep this live reader independent of longer-lived shared layout queries.
    // Admin invalidation of ["page-content"] still refreshes this child key.
    queryKey: ["page-content", "privacy-live"],
    queryFn: async ({ signal }) => {
      const r = await fetch(`${BASE}/api/page-content`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!r.ok) throw new Error("تعذر تحميل سياسة الخصوصية");
      const settings: Record<string, unknown> = await r.json();
      const text = settings.privacy_page_content;
      if (text != null && typeof text !== "string") {
        throw new Error("تعذر قراءة نص سياسة الخصوصية");
      }
      return typeof text === "string" ? text : "";
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    // Refresh an already-open preview too, not just after route navigation.
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });

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

          {isError && (
            <div role="alert" className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-foreground">
              <p>تعذّر تحميل أحدث نص لسياسة الخصوصية. يرجى إعادة المحاولة.</p>
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="mt-3 rounded-xl border border-border bg-background px-4 py-2 font-bold disabled:opacity-50"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : content ? (
            <InformationalContent content={content} />
          ) : !isError ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
              <p className="text-muted-foreground">سيتم إضافة سياسة الخصوصية قريباً.</p>
            </div>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}
