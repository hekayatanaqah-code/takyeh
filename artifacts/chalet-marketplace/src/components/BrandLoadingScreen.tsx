import type { ReactNode } from "react";

const FALLBACK_LOGO = `${import.meta.env.BASE_URL}images/splash-logo.webp`;

/** Shared by connection recovery and route-module loading. */
export default function BrandLoadingScreen({
  logo = FALLBACK_LOGO,
  connecting = false,
  message = "جارٍ التحميل...",
  children,
  testId = "route-loading",
}: {
  logo?: string;
  connecting?: boolean;
  message?: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div className={`takyah-status ${connecting ? "takyah-status--connection" : ""}`}
      role="status" aria-live="polite" aria-atomic="true" dir="rtl" data-testid={testId}>
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
        <p>{message}</p>
        {children}
      </div>
    </div>
  );
}
