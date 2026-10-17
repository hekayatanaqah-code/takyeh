import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeSaudiCurrencyText, saudiMoneyMessage } from "./saudiCurrency";
import { saudiCurrencyHtml, SAUDI_RIYAL_FONT_CSS } from "./saudiCurrencyFont";
import { currencyDisplayProps } from "./currency-jsx/props";

test("legacy currency units and Eastern digits, without changing links/IDs/phones", () => {
  assert.equal(normalizeSaudiCurrencyText("ر.س / ريال / ريالاً"), "⃁ / ⃁ / ⃁");
  assert.equal(saudiMoneyMessage("123.50 ريال"), "١٢٣.٥٠ ⃁");
  assert.equal(saudiMoneyMessage("(123) ر.س"), "(١٢٣) ⃁");
  assert.equal(saudiMoneyMessage("https://example.test/contract/123 هاتف 0501234567، 120 ر.س"), "https://example.test/contract/123 هاتف 0501234567، ١٢٠ ⃁");
  assert.equal(saudiMoneyMessage("{اسم_العميل}: ١٢٠ ر.س"), "{اسم_العميل}: ١٢٠ ⃁");
  assert.equal(normalizeSaudiCurrencyText("شاليه ريال الجميل"), "شاليه ريال الجميل");
});

test("presentation adapter never changes input values, payload attributes or templates", () => {
  const input = { value: "1250", placeholder: "السعر (ر.س)", "data-amount": 1250 };
  const output = currencyDisplayProps("input", input);
  assert.equal(output.value, "1250");
  assert.equal(output["data-amount"], 1250);
  assert.equal(output.placeholder, "السعر (⃁)");
  const template = { children: "120 ريال", value: "120 ريال" };
  assert.equal(currencyDisplayProps("textarea", template), template);
  assert.equal(currencyDisplayProps("span", { children: "120 ريال", "data-currency-raw": true }).children, "120 ريال");
  assert.equal(currencyDisplayProps("p", { children: ["120 ر.س", " النص"] }).children[0], "١٢٠ ⃁");
  assert.deepEqual(currencyDisplayProps("p", { children: [123, " ر.س"] }).children, ["١٢٣", " ⃁"]);
  assert.match(currencyDisplayProps("span", { children: "١٢٣ ر.س", style: {fontFamily:"Tahoma"} }).style.fontFamily, /Saudi Riyal Symbol/);
});

test("print previews embed the exact uploaded-SVG-derived font, no dependencies on installed fonts", () => {
  const embedded = SAUDI_RIYAL_FONT_CSS.match(/base64,([^)]*)/)![1];
  assert.deepEqual(Buffer.from(embedded, "base64"), readFileSync(new URL("../assets/saudi-riyal.woff2", import.meta.url)));
  const html = saudiCurrencyHtml("<html><style>body{font-family:Arial}</style><body>120 ر.س</body></html>");
  assert.match(html, /data:font\/woff2;base64/);
  assert.match(html, /١٢٠ ⃁/);
  assert.match(html, /font-family:'Saudi Riyal Symbol',Arial/);
});
