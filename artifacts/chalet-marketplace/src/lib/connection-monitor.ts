/** Observe API requests; only failed, read-only requests may be retried once after recovery. */
export type ConnectionSnapshot = {
  online: boolean;
  poor: boolean;
  oldestRequest: number | null;
  recovered: number;
};

export class ConnectionMonitor {
  private listeners = new Set<() => void>();
  private requests = new Map<symbol, number>();
  private probing = false;
  private state: ConnectionSnapshot = { online: true, poor: false, oldestRequest: null, recovered: 0 };

  constructor(
    private nativeFetch: typeof fetch,
    private apiUrl: string,
    private now = () => Date.now(),
    private scope = () => "",
  ) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<ConnectionSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  setOnline(online: boolean) {
    // An "online" event alone does not prove the API is reachable.
    this.update({ online, poor: online ? this.state.poor : true });
  }
  private relevant(input: RequestInfo | URL) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), this.apiUrl);
      return url.origin === new URL(this.apiUrl).origin
        && url.pathname.startsWith(new URL(this.apiUrl).pathname + "/")
        && !/\/(?:healthz|storage|media)(?:\/|$)/.test(url.pathname);
    } catch { return false; }
  }
  private waitForRecovery(signal?: AbortSignal | null) {
    return new Promise<void>((resolve, reject) => {
      let unsubscribe = () => {};
      const clean = () => { unsubscribe(); signal?.removeEventListener("abort", abort); };
      const abort = () => { clean(); reject(new DOMException("Cancelled", "AbortError")); };
      unsubscribe = this.subscribe(() => {
        if (this.state.online && !this.state.poor) { clean(); resolve(); }
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }

  fetch: typeof fetch = async (input, init) => {
    if (!this.relevant(input)) return this.nativeFetch(input, init);
    const id = Symbol();
    const scope = this.scope();
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = new URL(input instanceof Request ? input.url : String(input), this.apiUrl).pathname;
    // Customer notes have their own inline save status. A slow autosave must
    // not make the whole page inert and prevent the next edit. Still observe
    // transport failures below, and never replay the write after recovery.
    const noteAutosave = method === "PUT" && /\/owner\/(?:customers|service-clients)\/[^/]+\/note$/.test(path);
    if (!noteAutosave) this.requests.set(id, this.now());
    this.update({ oldestRequest: this.requests.size ? Math.min(...this.requests.values()) : null });
    try {
      // HTTP errors (including 401/403/500) are not evidence of lost internet.
      return await this.nativeFetch(input, init);
    } catch (error) {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      if (!signal?.aborted && !(error instanceof Error && error.name === "AbortError")) {
        this.update({ poor: true });
        // In particular, GET /auth/logout and other authentication actions are
        // NOT read-only. Writes and authentication actions are never replayed.
        const authAction = /\/(?:auth|logout|login|callback|verify|activate|reset|impersonat)[^/]*(?:\/|$)/i.test(path)
          && !path.endsWith("/auth/user");
        // Keep the session *read* pending while offline, so auth consumers do
        // not mistake a transport failure for logout and redirect open forms.
        const readOnly = (method === "GET" || method === "HEAD") && init?.body == null && !authAction;
        if (readOnly) {
          await this.waitForRecovery(signal);
          if (scope !== this.scope()) throw error;
          try { return await this.nativeFetch(input, init); }
          catch (retryError) {
            if (!signal?.aborted && !(retryError instanceof Error && retryError.name === "AbortError")) this.update({ poor: true });
            throw retryError;
          }
        }
      }
      throw error;
    } finally {
      this.requests.delete(id);
      this.update({ oldestRequest: this.requests.size ? Math.min(...this.requests.values()) : null });
    }
  };

  async probe() {
    if (this.probing || !this.state.online) return;
    this.probing = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const started = this.now();
    try {
      const response = await this.nativeFetch(`${this.apiUrl}/healthz`, {
        method: "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      if (!this.state.online) return;
      const poor = !response.ok || this.now() - started > 2500;
      const restored = !poor && this.state.poor;
      this.update({ poor, recovered: this.state.recovered + (restored ? 1 : 0) });
    } catch {
      this.update({ poor: true });
    } finally {
      clearTimeout(timeout);
      this.probing = false;
    }
  }
}

let monitor: ConnectionMonitor | undefined;
export function installConnectionMonitor() {
  if (monitor) return monitor;
  const nativeFetch = window.fetch.bind(window);
  const apiUrl = new URL(`${import.meta.env.BASE_URL}api`, location.origin).href;
  monitor = new ConnectionMonitor(nativeFetch, apiUrl, () => Date.now(), () => location.href);
  const current = monitor;
  current.setOnline(navigator.onLine);
  window.fetch = current.fetch;
  window.addEventListener("offline", () => current.setOnline(false));
  window.addEventListener("online", () => { current.setOnline(true); void current.probe(); });
  // Probe only when there is evidence of trouble, not on every healthy page.
  window.setInterval(() => {
    const state = current.getSnapshot();
    if (state.poor || (state.oldestRequest !== null && Date.now() - state.oldestRequest > 8000)) {
      void current.probe();
    }
  }, 4000);
  return current;
}

export function getConnectionMonitor() {
  if (!monitor) throw new Error("Connection monitor must be installed before rendering");
  return monitor;
}
