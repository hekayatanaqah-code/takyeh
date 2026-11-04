import { createRoot } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookingCalendarTab } from "../../src/components/owner/BookingCalendarTab";
import "../../src/index.css";

// Vite-only test entry, not an app route/build entry. Mount the same component
// used by Dashboard, including its real nested ManageInsuranceDialog and clock.
// Deliver query notifications without setTimeout(0): a paused browser clock
// must not strand API responses while assertions wait on the rendered state.
notifyManager.setScheduler(queueMicrotask);
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <BookingCalendarTab
      submissions={[{ id: 8601, status: "approved", nameAr: "عقار اختبار الإقامة" }]}
      ownerChalets={[{
        id: 8671, submissionId: 8601, nameAr: "عقار اختبار الإقامة", isActive: true,
        eveningCheckIn: "٤:٠٠ م", eveningCheckOut: "٥:٠٠ ص",
      }]}
      preferredReportCalendar="gregorian"
    />
  </QueryClientProvider>,
);
