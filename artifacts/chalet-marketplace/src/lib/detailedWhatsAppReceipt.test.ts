import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DETAILED_RECEIPT_TEMPLATE, detailedReceiptValues, renderDetailedReceipt } from "./detailedWhatsAppReceipt";
import { SAUDI_RIYAL_SIGN } from "./saudiCurrency";

const booking = {
  id: 1245, clientName: "عميل $& {اسم_العقار}", durationDays: 2, period: "evening",
  totalPrice: "1050.75", depositPaid: "300", insuranceFee: "200",
  bookedAddons: [{ name: "إضافة", price: "50.75", unit: "خدمة" }, { name: "هدية", price: "90", unit: "خدمة مجانية" }],
};
const context = {
  propertyName: "العقار الثاني", platformName: "اسم منصة متغير", terms: "شروط العقار الثاني\nالمغادرة في الموعد",
  hijri: "١ صفر ١٤٤٨", gregorian: "١٥ يوليو ٢٠٢٦", assetBaseUrl: "https://example.test/market",
};

test("dynamic identity, terms, accurate fractional amounts and Eastern currency", () => {
  const values = detailedReceiptValues(booking, context);
  const result = renderDetailedReceipt(DEFAULT_DETAILED_RECEIPT_TEMPLATE, values);
  assert.ok(result.startsWith(`إيصال حجز — ${context.propertyName}`));
  assert.ok(result.includes(context.platformName));
  assert.ok(result.includes(context.terms));
  assert.ok(result.includes("عميل $& {اسم_العقار}"));
  assert.equal(values["{الإيجار}"], (1000).toLocaleString("ar-SA", { maximumFractionDigits: 2 }));
  assert.equal(values["{المتبقي}"], (750.75).toLocaleString("ar-SA", { maximumFractionDigits: 2 }));
  assert.ok(result.includes(SAUDI_RIYAL_SIGN));
  assert.doesNotMatch(result, /حكاية أناقة|شاليهات القصيم|ر\.س|ريال|[0-9]/);
});

test("full owner control; legacy currency normalizes without changing links", () => {
  const custom = "نصي الخاص\n{اسم_العقار}\n{الشروط_والأحكام}\n123 ريال\nhttps://example.test/123";
  const result = renderDetailedReceipt(custom, detailedReceiptValues(booking, context));
  assert.ok(result.startsWith("نصي الخاص"));
  assert.ok(result.includes(`١٢٣ ${SAUDI_RIYAL_SIGN}`));
  assert.ok(result.includes("https://example.test/123"));
  assert.ok(!result.includes("تفاصيل المبالغ"));
});

test("proof images never skip approved terms or footer", () => {
  const result = renderDetailedReceipt(DEFAULT_DETAILED_RECEIPT_TEMPLATE, detailedReceiptValues({
    ...booking, insuranceRefunded: true, insuranceDeducted: "50", insuranceDeductReason: "ضرر",
    insuranceProofImages: JSON.stringify(["/objects/proof123.jpg", "https://cdn.example.test/photo123.jpg", "javascript:alert(1)"]),
  }, context));
  assert.ok(result.includes("https://example.test/market/objects/proof123.jpg"));
  assert.ok(result.includes("https://cdn.example.test/photo123.jpg"));
  assert.ok(result.includes(context.terms));
  assert.ok(result.includes(context.platformName));
  assert.doesNotMatch(result, /javascript:/);
});

test("settled balance, empty terms and malformed proof list are explicit", () => {
  const values = detailedReceiptValues({
    ...booking, balanceCollected: true, insuranceRefunded: true, insuranceProofImages: '{"not":"array"}',
  }, { ...context, terms: "", platformName: "" });
  assert.equal(values["{المتبقي}"], "٠");
  assert.equal(values["{صور_التوثيق}"], "");
  assert.equal(values["{اسم_المنصة}"], "");
  assert.equal(values["{حالة_التأمين}"], "تم إرجاع التأمين بالكامل");
  assert.equal(values["{الشروط_والأحكام}"], "لا توجد شروط وأحكام مضافة للعقار.");
});
