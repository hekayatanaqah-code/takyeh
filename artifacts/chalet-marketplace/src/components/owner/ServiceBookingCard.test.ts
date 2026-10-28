import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceBookingCard, serviceFinancialState } from "./ServiceBookingCard";
import { normalizePaymentAmountInput, validateAdditionalPayment } from "./ServiceBookingPaymentDialog";
import BookingArchivePagination from "./BookingArchivePagination";

Object.assign(globalThis, { React });
const noop = () => {};
const base = { id: 7, clientName: "سارة", clientPhone: "0551234567", dateStr: "2025-03-10", startTime: "16:30", status: "confirmed", amount: "500", deposit: "200", paymentMethod: "cash", cashDeposited: false, source: "platform" };
const render = (a: any, options: { requiresContract?: boolean; onDelete?: () => void } = {}) => renderToStaticMarkup(React.createElement(ServiceBookingCard, {
  appointment: a, serviceName: "خدمة", sourceLabel: "المنصة", templates: [], messageMenuOpen: false,
  onToggleMessageMenu: noop, onSendTemplate: noop, onReceipt: noop, onEdit: noop, onAddPayment: noop, onConfirm: noop, onCancel: noop,
  onPreviewContract: noop, onSendContract: noop, onToggleContractSigned: noop, onToggleCashDeposited: noop, onSendReview: noop,
  ...options,
}));

it("computes honest remaining and cash custody", () => {
  const f = serviceFinancialState(base);
  assert.equal(f.remaining, 300);
  assert.equal(f.strip.tone, "orange");
  assert.equal(serviceFinancialState({ ...base, deposit: "900" }).remaining, 0);
  assert.equal(serviceFinancialState({ ...base, paymentMethod: "pos" }).strip.tone, "blue");
});

it("renders single edit, add payment, and hides collect when cancelled", () => {
  const html = render(base);
  assert.equal(html.match(/button-service-edit-7/g)?.length, 1);
  assert.ok(html.includes("button-service-add-payment-7"));
  assert.ok(html.includes("16:30") || html.includes("١٦:٣٠"));
  assert.ok(!render({ ...base, status: "cancelled" }).includes("button-service-add-payment"));
  assert.ok(!render({ ...base, deposit: "500" }).includes("button-service-add-payment"));
});

it("validates eastern decimal payments", () => {
  assert.equal(normalizePaymentAmountInput("١٥٠٫٥"), "150.5");
  assert.equal(validateAdditionalPayment("150.5", 300), null);
  assert.ok(validateAdditionalPayment("300.01", 300));
  assert.ok(validateAdditionalPayment("0", 300));
  assert.ok(validateAdditionalPayment("1.234", 300));
  assert.ok(validateAdditionalPayment(normalizePaymentAmountInput("-١٠"), 300));
  assert.ok(validateAdditionalPayment(normalizePaymentAmountInput("1e3"), 300));
  assert.ok(validateAdditionalPayment(normalizePaymentAmountInput("١.٢.٣"), 300));
});

it("keeps all actions in two balanced rows without horizontal scrolling", () => {
  const html = render(base);
  assert.ok(html.includes('data-testid="service-booking-action-strip-7"'));
  assert.ok(html.includes('data-action-rows="2"'));
  assert.ok(html.includes("grid-rows-2"));
  assert.ok(html.includes("repeat(3, minmax(0, 1fr))"));
  assert.ok(!html.includes("overflow-x-auto"));
  assert.ok(!html.includes("مرّر"));
  assert.ok(!html.includes("absolute right-0 top-full"));
  const expanded = render({ ...base, status: "pending" }, { requiresContract: true, onDelete: noop });
  assert.ok(expanded.includes("repeat(6, minmax(0, 1fr))"));
  for (const label of ["إضافة دفعة", "معاينة العقد", "إرسال العقد", "تحديد كموقّع", "حذف السجل"]) {
    assert.ok(expanded.includes(label), `keeps ${label} visible`);
  }
  const cancelled = render({ ...base, status: "cancelled" }, { onDelete: noop });
  assert.ok(cancelled.includes("repeat(3, minmax(0, 1fr))"));
});

it("renders previous, next and numbered navigation with service-specific label", () => {
  const html = renderToStaticMarkup(React.createElement(BookingArchivePagination, {
    page: 2, total: 25, loading: false, onChange: noop, label: "صفحات سجل حجوزات الخدمات",
  }));
  assert.ok(html.includes('aria-label="صفحات سجل حجوزات الخدمات"'));
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(html.includes("السابق"));
  assert.ok(html.includes("التالي"));
  assert.ok(html.includes("١١"));
  assert.ok(html.includes("٢٠"));
  assert.ok(html.includes("٢٥"));
});
