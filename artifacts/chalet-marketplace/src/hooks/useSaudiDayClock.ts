import { useEffect, useState } from "react";

/** Keep mounted lists/badges current across Saudi midnight and sleeping tabs. */
export function useSaudiDayClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    const tick = () => setNow(Date.now());
    const schedule = () => {
      midnightTimer = setTimeout(() => {
        tick();
        schedule();
      }, 86400000 - ((Date.now() + 3 * 60 * 60 * 1000) % 86400000));
    };
    schedule();
    const interval = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(midnightTimer);
      clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}
