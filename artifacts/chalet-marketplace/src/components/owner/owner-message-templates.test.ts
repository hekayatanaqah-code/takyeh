import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_OWNER_MESSAGE_SETTINGS, MESSAGE_VARIABLES, SERVICE_MESSAGE_VARIABLES,
  bookingMessageActivityNames, serviceMessageName, prepareServiceMessageTemplate,
} from "./owner-message-templates";

const keys = ["bookingConfirmationTemplate", "cancellationTemplate", "modificationTemplate"] as const;

test("all three service defaults and their variable palette exclusively use the service name", () => {
  const defaults = bookingMessageActivityNames(DEFAULT_OWNER_MESSAGE_SETTINGS, "service");
  for (const key of keys) {
    assert.ok(defaults[key].includes("{اسم_الخدمة}"));
    assert.ok(!defaults[key].includes("{اسم_العقار}"));
    assert.ok(DEFAULT_OWNER_MESSAGE_SETTINGS[key].includes("{اسم_العقار}"));
  }
  assert.ok(!SERVICE_MESSAGE_VARIABLES.includes("{اسم_العقار}"));
  assert.equal(SERVICE_MESSAGE_VARIABLES.filter(value => value === "{اسم_الخدمة}").length, 1);
  assert.ok(MESSAGE_VARIABLES.includes("{اسم_العقار}"));
});

test("service conversion preserves owner wording, amounts, dates and unrelated templates verbatim", () => {
  const body = "نص المالك الخاص {اسم_العقار}\n{الإجمالي_الكلي} {التاريخ} {سبب_التعديل}";
  const saved = { ...DEFAULT_OWNER_MESSAGE_SETTINGS, cancellationTemplate: body, customTemplates: [{ id: "test", title: "خاص", body }] };
  const projected = bookingMessageActivityNames(saved, "service");
  assert.equal(projected.cancellationTemplate, body.replace("{اسم_العقار}", "{اسم_الخدمة}"));
  assert.equal(projected.customTemplates, saved.customTemplates);
  assert.equal(projected.detailedReceiptTemplate, saved.detailedReceiptTemplate);
  assert.equal(saved.cancellationTemplate, body);
  assert.deepEqual(bookingMessageActivityNames(projected, "shared"), saved);
});

test("service preview and actual sending preparation resolve legacy and new name tokens consistently", () => {
  const body = "تم الحجز في {اسم_العقار} — {اسم_الخدمة}\nالمدة: {المدة}";
  const prepared = prepareServiceMessageTemplate(body);
  assert.ok(!prepared.includes("{اسم_العقار}"));
  assert.equal(prepared.split("{اسم_الخدمة}").length - 1, 2);
  assert.equal(serviceMessageName(serviceMessageName(body)), serviceMessageName(body));
  assert.equal(prepared.replace(/\{اسم_الخدمة\}/g, "الخدمة المختارة"), "تم الحجز في الخدمة المختارة — الخدمة المختارة\nالمدة: {المدة}");
});

test("load, save response and reset retain service-only labels without rewriting the shared property defaults", () => {
  const source = readFileSync(new URL("./OwnerMessageSettingsTab.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/variables=\{providerId \? SERVICE_MESSAGE_VARIABLES : MESSAGE_VARIABLES\}/g) ?? []).length, 3);
  assert.ok(source.includes('bookingMessageActivityNames(form, "shared", data)'));
  assert.ok(source.includes('bookingMessageActivityNames(next, "service")'));
  assert.ok(source.includes("serviceMessageName(base.cancellationTemplate)"));
  assert.ok(source.includes("serviceMessageName(base.modificationTemplate)"));
  assert.ok(source.includes("serviceMessageName(template)"));
});

test("the service confirmation uses the service greeting while preserving the stored property wording", () => {
  const original = { ...DEFAULT_OWNER_MESSAGE_SETTINGS, bookingConfirmationTemplate: "تم تأكيد حجزك في {اسم_العقار}. نسعد باستقبالك." };
  const service = bookingMessageActivityNames(original, "service");
  assert.equal(service.bookingConfirmationTemplate, "تم تأكيد حجزك في {اسم_الخدمة}. نسعد بخدمتك.");
  assert.equal(prepareServiceMessageTemplate(original.bookingConfirmationTemplate), service.bookingConfirmationTemplate);
  assert.deepEqual(bookingMessageActivityNames(service, "shared", original), original);
  assert.ok(original.bookingConfirmationTemplate.includes("نسعد باستقبالك."));
  const custom = { ...original, bookingConfirmationTemplate: "صياغة المالك الخاصة. نسعد بخدمتك." };
  assert.equal(bookingMessageActivityNames(custom, "shared", custom).bookingConfirmationTemplate, custom.bookingConfirmationTemplate);
});
