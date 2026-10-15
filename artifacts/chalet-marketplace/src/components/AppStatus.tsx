import { useEffect, useState, useSyncExternalStore } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { getConnectionMonitor } from "@/lib/connection-monitor";

const FALLBACK_LOGO = `${import.meta.env.BASE_URL}images/splash-logo.webp`;

export default function AppStatus() {
  const monitor = getConnectionMonitor();
  const state = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot);
  const client = useQueryClient();
  const initialReads = useIsFetching({ predicate: query => query.state.data === undefined });
  const [started] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const [restored, setRestored] = useState(false);
  const [booting, setBooting] = useState(true);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    document.getElementById("takyah-boot")?.remove();
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initialReads === 0) { setReading(false); return; }
    const timer = window.setTimeout(() => setReading(true), 350);
    return () => clearTimeout(timer);
  }, [initialReads]);

  useEffect(() => {
    if (!initialReads) return;
    // fetch() can resolve its headers before a slow JSON body finishes.
    // Continue checking reachability while foreground queries still load.
    let interval: number | undefined;
    const timer = window.setTimeout(() => {
      void monitor.probe();
      interval = window.setInterval(() => { void monitor.probe(); }, 4000);
    }, 8000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [initialReads, monitor]);

  useEffect(() => {
    if (now - started >= 500 && initialReads === 0 && state.oldestRequest === null) setBooting(false);
  }, [initialReads, now, started, state.oldestRequest]);

  useEffect(() => {
    if (!state.recovered) return;
    setRestored(true);
    // Only retry failed, empty reads. Never replay saves/payments, refresh the
    // document, or overwrite already populated forms with background refetches.
    void client.refetchQueries({
      type: "active",
      predicate: query => query.state.status === "error" && query.state.data === undefined,
    }, { cancelRefetch: false });
    const timer = window.setTimeout(() => setRestored(false), 3000);
    return () => clearTimeout(timer);
  }, [client, state.recovered]);

  const connecting = !state.online || state.poor;
  const slow = state.oldestRequest !== null && now - state.oldestRequest > 1200;
  const loading = booting || slow || reading;
  const pageContent = client.getQueryData<Record<string, string>>(["page-content"]);
  const logo = connecting ? FALLBACK_LOGO : pageContent?.site_logo_url || FALLBACK_LOGO;

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !(connecting || loading)) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.inert = true;
    root.setAttribute("aria-busy", "true");
    return () => {
      root.inert = false;
      root.removeAttribute("aria-busy");
      if (focused?.isConnected && document.activeElement === document.body) focused.focus({ preventScroll: true });
    };
  }, [connecting, loading]);

  return createPortal(<>
    {(connecting || loading) && <div className={`takyah-status ${connecting ? "takyah-status--connection" : ""}`}
      role="status" aria-live="polite" aria-atomic="true" dir="rtl"
      data-testid={connecting ? "connection-overlay" : "loading-overlay"}>
      <div className="takyah-status__content">
        <div className="takyah-status__brand">
          <span className="takyah-status__fallback" aria-hidden="true">تكية</span>
          <img src={logo} alt="شعار منصة تكية" width="144" height="144"
            onError={event => {
              if (event.currentTarget.getAttribute("src") !== FALLBACK_LOGO) event.currentTarget.src = FALLBACK_LOGO;
              else event.currentTarget.style.visibility = "hidden";
            }} />
        </div>
        <div className="takyah-status__dots" aria-hidden="true"><i /><i /><i /></div>
        <p>{connecting ? "جاري الاتصال... يرجى التأكد من شبكة الإنترنت" : "جارٍ التحميل..."}</p>
        {connecting && <small>سنعاود الاتصال تلقائياً، يمكنك إبقاء هذه الصفحة مفتوحة.</small>}
      </div>
    </div>}
    {restored && !connecting && <div className="takyah-connection-restored" role="status" dir="rtl"
      data-testid="connection-restored">تم استعادة الاتصال</div>}
  </>, document.body);
}
