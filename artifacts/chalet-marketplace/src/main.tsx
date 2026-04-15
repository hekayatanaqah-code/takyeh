import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/* ─── Global Arabic-Indic numeral enforcer ───────────────────────────────
   Intercepts beforeinput on numeric inputs (inputMode="numeric" or type="tel")
   and converts Western digits (0-9) → Arabic-Indic (٠-٩) transparently.
   Fields marked with data-no-arabic are skipped (e.g. phone, WhatsApp).
   ─────────────────────────────────────────────────────────────────────── */
const _nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
const _toArDigit = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x0630));

document.addEventListener("beforeinput", (e: Event) => {
  const ie = e as InputEvent;
  const el = ie.target as HTMLInputElement;
  if (!(el instanceof HTMLInputElement)) return;
  if ("noArabic" in el.dataset) return;
  if (el.inputMode !== "numeric" && el.type !== "tel") return;
  if (!ie.data || !/[0-9]/.test(ie.data)) return;

  ie.preventDefault();
  const arData = _toArDigit(ie.data);
  const s = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, s) + arData + el.value.slice(end);
  _nativeSet?.call(el, next);
  try { el.setSelectionRange(s + arData.length, s + arData.length); } catch {}
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, true);

createRoot(document.getElementById("root")!).render(<App />);
