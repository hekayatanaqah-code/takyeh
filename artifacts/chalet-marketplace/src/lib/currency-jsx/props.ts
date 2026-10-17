import { saudiMoneyMessage } from "../saudiCurrency";
import { saudiCurrencyHtml } from "../saudiCurrencyFont";

/** Presentation only: never change saved values, input values, URLs or payment payloads. */
export function currencyDisplayProps(type: unknown, props: any) {
  if (typeof type !== "string" || !props || props["data-currency-raw"] ||
    ["textarea", "script", "style", "option"].includes(type)) return props;
  const formatChild = (child: unknown): unknown =>
    typeof child === "string" ? saudiMoneyMessage(child) :
      typeof child === "number" && Number.isFinite(child)
        ? String(child).replace(/[0-9]/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]) :
      Array.isArray(child) ? child.map(formatChild) : child;
  const children = formatChild(props.children);
  const placeholder = typeof props.placeholder === "string" ? saudiMoneyMessage(props.placeholder) : props.placeholder;
  const style = typeof props.style?.fontFamily === "string" && !props.style.fontFamily.includes("Saudi Riyal Symbol")
    ? { ...props.style, fontFamily: `"Saudi Riyal Symbol", ${props.style.fontFamily}` } : props.style;
  if (typeof props.dangerouslySetInnerHTML?.__html === "string") {
    return { ...props, dangerouslySetInnerHTML: { __html: saudiCurrencyHtml(props.dangerouslySetInnerHTML.__html) } };
  }
  if (children === props.children && placeholder === props.placeholder && style === props.style) return props;
  return { ...props, children, ...(placeholder === undefined ? {} : { placeholder }), ...(style === undefined ? {} : { style }) };
}
