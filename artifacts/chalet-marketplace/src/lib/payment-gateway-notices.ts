/** Localize SDK setup diagnostics only; card validation and payment errors stay visible. */
export function localizeGatewaySetupNotices(container: HTMLElement): () => void {
  const message = "تعذّر تهيئة وسيلة الدفع حالياً. يرجى إعادة المحاولة أو التواصل مع الدعم.";
  const update = () => {
    container.querySelectorAll<HTMLElement>(".mysr-form-configNotice").forEach((notice) => {
      if (notice.textContent !== message) notice.textContent = message;
      notice.setAttribute("role", "alert");
    });
  };
  const observer = new MutationObserver(update);
  observer.observe(container, { childList: true, subtree: true });
  update();
  return () => observer.disconnect();
}
