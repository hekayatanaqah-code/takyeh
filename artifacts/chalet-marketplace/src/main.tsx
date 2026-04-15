import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/* ─── Global Arabic-Indic numeral enforcer ───────────────────────────────
   Intercepts typing AND paste on numeric inputs (inputMode="numeric").
   Converts Western digits (0-9) → Arabic-Indic (٠-٩) transparently.
   Fields marked with data-no-arabic are skipped (phone/WhatsApp use
   toAr() in the value prop instead, stored as Western for links/APIs).
   ─────────────────────────────────────────────────────────────────────── */
const _nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
const _toArDigit = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x0630));

function _applyAr(el: HTMLInputElement, text: string) {
  const converted = _toArDigit(text);
  const s = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, s) + converted + el.value.slice(end);
  _nativeSet?.call(el, next);
  try { el.setSelectionRange(s + converted.length, s + converted.length); } catch {}
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function _isTarget(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if ("noArabic" in el.dataset) return false;
  return el.inputMode === "numeric";
}

/* Typing */
document.addEventListener("beforeinput", (e: Event) => {
  const ie = e as InputEvent;
  if (!_isTarget(ie.target)) return;
  if (!ie.data || !/[0-9]/.test(ie.data)) return;
  ie.preventDefault();
  _applyAr(ie.target as HTMLInputElement, ie.data);
}, true);

/* Paste */
document.addEventListener("paste", (e: ClipboardEvent) => {
  if (!_isTarget(e.target)) return;
  const text = e.clipboardData?.getData("text") ?? "";
  if (!text || !/[0-9]/.test(text)) return;
  e.preventDefault();
  _applyAr(e.target as HTMLInputElement, text);
}, true);

createRoot(document.getElementById("root")!).render(<App />);
