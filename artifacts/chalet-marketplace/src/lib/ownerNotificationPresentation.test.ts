import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownerNotificationDate, ownerNotificationPresentation as present } from "./ownerNotificationPresentation";

describe("owner notification presentation across filters", () => {
  it("hides persisted and legacy subscription keys without losing Arabic content", () => {
    for (const marker of ["\u2063subscription-expiry:1799999999999:3\u2063", "[subscription-expiry:1799999999999:0]", "subscription-expiry:1799999999999:5"]) {
      assert.equal(present(`⏳ ينتهي اشتراكك قريباً.${marker}`, "subscription_expiry_reminder").text, "ينتهي اشتراكك قريباً.");
      assert.equal(present(marker, "subscription_expiry_reminder").text, "تذكير بانتهاء الاشتراك");
    }
  });
  it("removes duplicate leading icons and private booking markers", () => {
    assert.equal(present("⏰ ⏰ تذكير: حجز غداً · عميل [booking:73]", "booking_reminder").text, "تذكير: حجز غداً · عميل");
  });
  it("cleans numeric dates for every filter while preserving period and real numbers", () => {
    for (const type of ["new_booking", "booking_reminder", "cancellation", "new_review", "subscription_expiry_reminder"]) {
      for (const date of ["2026-10-23", "23-10-2026", "٢٠٢٦/١٠/٢٣", "٢٣/١٠/٢٠٢٦"]) {
        assert.equal(present(`حجز — عميل — ${date} (مسائي) — رقم 123`, type).text, "حجز — عميل — (مسائي) — رقم 123");
      }
    }
  });
  it("formats add-on amounts with currency, leaving period parentheses alone", () => {
    const { text } = present("حجز (صباحي)\nالخدمات الإضافية: مسبح داخلي (200 ر.س)", "new_booking");
    assert.equal(text, "حجز (صباحي)\nالخدمات الإضافية: مسبح داخلي: ٢٠٠ \u20c1");
  });
  it("retains the WhatsApp action URL and encoded contents exactly", () => {
    const url = "wa.me/966500000000?text=2026-10-23%20%28200%29";
    const { text, waHref } = present(`حجز جديد — 2026-10-23 | ${url}`, "new_booking");
    assert.equal(text, "حجز جديد");
    assert.equal(waHref, `https://${url}`);
  });
  it("renders both calendars with Eastern digits and handles invalid timestamps", () => {
    const date = ownerNotificationDate("2026-10-23T23:30:00Z");
    assert.equal(typeof date, "object");
    assert(!/[0-9]/.test(JSON.stringify(date)));
    assert.match(JSON.stringify(date), /هـ/);
    assert.match(JSON.stringify(date), /أكتوبر/);
    assert.equal(ownerNotificationDate("invalid"), "تاريخ الإشعار غير متاح");
  });
});
