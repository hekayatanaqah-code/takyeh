import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import AppStatus from "../../src/components/AppStatus";
import { installConnectionMonitor } from "../../src/lib/connection-monitor";

// This HTML entry is served by Vite only; it is not an application route or a
// build entry. Playwright blocks every API/third-party request before mounting.
installConnectionMonitor();
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
    mutations: { retry: false },
  },
});
const api = `${import.meta.env.BASE_URL}api/__connection_e2e`;

function ConnectionForm() {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [readKey, setReadKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState("idle");
  const [paymentState, setPaymentState] = useState("idle");
  const editor = useRef<HTMLTextAreaElement>(null);
  const read = useQuery({
    queryKey: ["connection-fixture", readKey],
    enabled: readKey !== null,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${api}/read/${readKey}`, { signal });
      if (!response.ok) throw new Error(`Read failed: ${response.status}`);
      return response.json() as Promise<{ message: string }>;
    },
  });

  const startRead = (key: string) => {
    setReadKey(key);
    editor.current?.focus();
  };
  const write = async (kind: "save" | "payment") => {
    const setState = kind === "save" ? setSaveState : setPaymentState;
    setState("pending");
    editor.current?.focus();
    try {
      await client.getMutationCache().build(client, {
        mutationFn: async () => {
          const response = await fetch(`${api}/${kind}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, notes, amount: 100 }),
          });
          if (!response.ok) throw new Error(`Write failed: ${response.status}`);
          return response.json();
        },
      }).execute(undefined);
      setState("success");
    } catch {
      setState("error");
    }
  };

  return <>
    <form onSubmit={event => event.preventDefault()} style={{ padding: 20, maxWidth: 560 }}>
      <h1>نموذج صناعي لاختبار الاتصال</h1>
      <label>الاسم
        <input aria-label="الاسم" value={name} onChange={event => setName(event.target.value)} />
      </label>
      <label style={{ display: "block", margin: "16px 0" }}>الملاحظات
        <textarea ref={editor} aria-label="الملاحظات" value={notes}
          onChange={event => setNotes(event.target.value)} style={{ display: "block", width: "100%" }} />
      </label>
      <button type="button" onClick={() => startRead("slow")}>قراءة بطيئة</button>
      <button type="button" onClick={() => startRead("offline")}>قراءة قبل الانقطاع</button>
      <button type="button" onClick={() => void write("save")}>حفظ صناعي</button>
      <button type="button" onClick={() => void write("payment")}>دفع صناعي</button>
      <output data-testid="read-state">{read.fetchStatus}</output>
      <output data-testid="read-result">{read.data?.message ?? ""}</output>
      <output data-testid="save-state">{saveState}</output>
      <output data-testid="payment-state">{paymentState}</output>
    </form>
    <AppStatus />
  </>;
}

// Test-only cancellation uses React Query's real AbortSignal path even while
// the root is inert. No overlay controls or production monitor hooks are added.
Object.assign(window, {
  cancelConnectionRead: () => client.cancelQueries({ queryKey: ["connection-fixture"] }),
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}><ConnectionForm /></QueryClientProvider>,
);
