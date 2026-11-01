


export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
}
