import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installConnectionMonitor } from "./lib/connection-monitor";

installConnectionMonitor();

const MOBILE_UI_CACHE_RELEASE = "partners-mobile-ui-2026-09";

async function clearLegacyFrontendCaches() {
  try {
    if (localStorage.getItem("takyah-frontend-cache-release") === MOBILE_UI_CACHE_RELEASE) return;

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }

    localStorage.setItem("takyah-frontend-cache-release", MOBILE_UI_CACHE_RELEASE);
  } catch {
    // Cache cleanup must never prevent the application from starting.
  }
}

void clearLegacyFrontendCaches();

/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL ARABIC-INDIC NUMERAL ENFORCER
   ═══════════════════════════════════════════════════════════════════════════
   Two-layer strategy:
   1. INPUT LAYER  — intercepts beforeinput / paste on inputMode="numeric"
                     fields and converts Western→Arabic-Indic digits in real
                     time. Fields with data-no-arabic (phone, WhatsApp, email)
                     are exempt.
   2. TEXT-NODE LAYER — MutationObserver that scans every text node in the DOM
                     and converts any remaining [0-9] to [٠-٩]. This handles
                     all rendered numbers: stats, charts, tables, tooltips,
                     dynamically loaded report figures, etc.
                     Excluded: <script>, <style>, <code>, <pre>, <input>,
                     <textarea>, elements/ancestors with data-no-arabic, and
                     elements/ancestors with dir="ltr".
   ═══════════════════════════════════════════════════════════════════════════ */

const _toArDigit = (s: string) =>
  s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x0630));

/* ── Layer 1: Input field interceptor ───────────────────────── */
const _nativeSet = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)?.set;

function _applyAr(el: HTMLInputElement, text: string) {
  const converted = _toArDigit(text);
  const s = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, s) + converted + el.value.slice(end);
  _nativeSet?.call(el, next);
  try {
    el.setSelectionRange(s + converted.length, s + converted.length);
  } catch {}
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function _isInputTarget(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if ("noArabic" in el.dataset) return false;
  return el.inputMode === "numeric";
}

document.addEventListener(
  "beforeinput",
  (e: Event) => {
    const ie = e as InputEvent;
    if (!_isInputTarget(ie.target)) return;
    if (!ie.data || !/[0-9]/.test(ie.data)) return;
    ie.preventDefault();
    _applyAr(ie.target as HTMLInputElement, ie.data);
  },
  true
);

document.addEventListener(
  "paste",
  (e: ClipboardEvent) => {
    if (!_isInputTarget(e.target)) return;
    const text = e.clipboardData?.getData("text") ?? "";
    if (!text || !/[0-9]/.test(text)) return;
    e.preventDefault();
    _applyAr(e.target as HTMLInputElement, text);
  },
  true
);

/* ── Layer 2: Text-node MutationObserver ────────────────────── */

/** Tags whose text content must NEVER be touched. */
const _SKIP_TAGS = new Set([
  "script", "style", "code", "pre", "input", "textarea", "select",
]);

/**
 * Walk up the DOM and check if any ancestor should prevent conversion.
 * Stops at document.body.
 * Only data-no-arabic prevents conversion — dir="ltr" is NOT excluded so
 * phone numbers and stats in LTR containers still get Arabic-Indic digits.
 */
function _hasExcludedAncestor(node: Node): boolean {
  let cur: Element | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;

  while (cur && cur !== document.body) {
    const tag = cur.tagName?.toLowerCase() ?? "";
    if (_SKIP_TAGS.has(tag)) return true;
    if ("noArabic" in (cur as HTMLElement).dataset) return true;
    cur = cur.parentElement;
  }
  return false;
}

/** Convert digits in a single text node (safe re-entrant guard). */
let _converting = false;

function _convertTextNode(node: Text) {
  if (_converting) return;
  if (!node.data) return;
  if (!/[0-9]/.test(node.data)) return;
  if (_hasExcludedAncestor(node)) return;
  _converting = true;
  node.data = _toArDigit(node.data);
  _converting = false;
}

/** Walk all text descendants of a root element. */
function _walkTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    _convertTextNode(node as Text);
  }
}

/* Initial pass — runs after React first renders into the DOM */
requestAnimationFrame(() => {
  if (document.body) _walkTree(document.body);
});

/* Watch for DOM changes */
const _observer = new MutationObserver((mutations) => {
  if (_converting) return;
  for (const m of mutations) {
    if (m.type === "characterData") {
      _convertTextNode(m.target as Text);
    } else if (m.type === "childList") {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          _convertTextNode(node as Text);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          _walkTree(node);
        }
      }
    }
  }
});

_observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

/* ═══════════════════════════════════════════════════════════════════════════ */

createRoot(document.getElementById("root")!).render(<App />);
