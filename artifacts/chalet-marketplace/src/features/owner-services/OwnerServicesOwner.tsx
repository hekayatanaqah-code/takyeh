import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, Clock } from "lucide-react";
import { call, btnCls, ghostCls, cardCls, Skel, ErrorBox, Empty, Notice, type Booking } from "../photography/shared";
import PhotographyOwner from "../photography/PhotographyOwner";
import { ICONS, isSafeUrl, resolveUrl, isExternal, type OwnerService } from "./types";

const KEY = ["owner-services"];

function initialActive(): boolean {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return !!sp.get("photographyBooking") || sp.get("ownerService") === "photography";
}

export default function OwnerServicesOwner() {
  const q = useQuery({ queryKey: KEY, queryFn: () => call<{ services: OwnerService[] }>("/owner-services"), refetchInterval: 30000 });
  const history = useQuery({ queryKey: ["ph-owner-bookings"], queryFn: () => call<{ bookings: Booking[] }>("/photography/bookings"), refetchInterval: 30000 });
  const hasBookings = (history.data?.bookings.length ?? 0) > 0;
  // Payment-return mode keeps photography mounted regardless of card visibility.
  const [paymentReturn] = useState(() => typeof window !== "undefined" && !!new URLSearchParams(window.location.search).get("photographyBooking"));
  const [active, setActive] = useState(initialActive);
  const [notice, setNotice] = useState<string | null>(null);

  const photo = q.data?.services.find((s) => s.kind === "photography");
  useEffect(() => {
    if (!active || paymentReturn || hasBookings || history.isLoading || !q.data) return;
    if (!photo) { setActive(false); setNotice("تم إخفاء خدمة التصوير من قبل الإدارة."); }
    else if (photo.state !== "available") { setActive(false); setNotice("خدمة التصوير متوقفة مؤقتا وستعود قريبا."); }
  }, [active, paymentReturn, hasBookings, history.isLoading, q.data, photo]);

  const back = () => {
    setActive(false);
    const u = new URL(window.location.href);
    if (u.searchParams.has("ownerService")) { u.searchParams.delete("ownerService"); window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash); }
  };

  if (active) {
    return (
      <div className="space-y-4" dir="rtl" data-testid="owner-services-photography">
        <button className={ghostCls} onClick={back} data-testid="button-back-services"><ArrowRight className="h-4 w-4" aria-hidden /> العودة إلى الخدمات</button>
        <PhotographyOwner />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl" data-testid="owner-services">
      <header>
        <h2 className="text-xl font-bold">خدمات الملاك</h2>
        {hasBookings && <button type="button" className={ghostCls} onClick={() => {
          setActive(true);
          const u = new URL(window.location.href); u.searchParams.set("ownerService", "photography");
          window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
        }} data-testid="button-photography-history">حجوزات التصوير والتقييم</button>}
        <p className="text-sm text-muted-foreground">خدمات إضافية لعقاراتك وخدماتك وأنشطتك، منفصلة عن التشغيل اليومي.</p>
      </header>
      {notice && <Notice tone="warn">{notice}</Notice>}
      {q.isLoading ? <Skel /> : q.isError || !q.data ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> :
        q.data.services.length === 0 ? <Empty title="لا توجد خدمات حاليا" text="ستظهر هنا الخدمات الإضافية عند إتاحتها." /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.services.map((s) => {
              const Icon = ICONS[s.icon] ?? ICONS.briefcase;
              const soon = s.state !== "available";
              const linkOk = s.kind === "link" && isSafeUrl(s.actionUrl);
              return (
                <li key={s.id} className={`${cardCls} flex flex-col gap-3 ${soon ? "opacity-80" : ""}`} data-testid={`card-service-${s.id}`}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">{s.title}</h3>
                      {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                    </div>
                  </div>
                  <div className="mt-auto">
                    {soon ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700" data-testid={`status-soon-${s.id}`} aria-label={`${s.title}: قريبا، غير متاحة للطلب`}>
                        <Clock className="h-3.5 w-3.5" aria-hidden /> قريبا - غير متاحة للطلب
                      </span>
                    ) : s.kind === "photography" ? (
                      <button className={btnCls} onClick={() => {
                        setNotice(null); setActive(true);
                        const u = new URL(window.location.href);
                        u.searchParams.set("ownerService", "photography");
                        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
                      }} data-testid={`button-open-service-${s.id}`}>فتح الخدمة</button>
                    ) : linkOk ? (
                      <a className={btnCls} href={resolveUrl(s.actionUrl!)} {...(isExternal(s.actionUrl!) ? { target: "_blank", rel: "noopener noreferrer" } : {})} data-testid={`link-request-service-${s.id}`}>
                        طلب الخدمة {isExternal(s.actionUrl!) && <ExternalLink className="h-4 w-4" aria-hidden />}
                      </a>
                    ) : <span className="text-xs text-muted-foreground">رابط الطلب غير متوفر</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
