import assert from "node:assert/strict";
import test from "node:test";
import { contactPhoneInput, localContactPhone, profileContactErrors } from "./owner-profile-contact";

test("phone input accepts Latin, Arabic and Persian digits, strips letters and limits length", () => {
  assert.equal(contactPhoneInput("abc٠٥١۲۳۴٥٦٧٨xyz"), "0512345678");
  assert.equal(contactPhoneInput("051234567899"), "0512345678");
  assert.equal(contactPhoneInput("letters only"), "");
});

test("stored Saudi international numbers are displayed locally without changing phone identity", () => {
  for (const phone of ["+966 51 234 5678", "00966512345678", "٥١٢٣٤٥٦٧٨", "0512345678"]) {
    assert.equal(localContactPhone(phone), "0512345678");
  }
  assert.equal(localContactPhone("1234567890123"), "1234567890123");
});

test("mobile and email cannot be empty or malformed before save or verification", () => {
  assert.ok(profileContactErrors("", "owner@example.com").phone);
  assert.ok(profileContactErrors("0512345678", " ").email);
  assert.ok(profileContactErrors("05123", "bad-email").phone);
  assert.ok(profileContactErrors("0512345678", "bad-email").email);
  assert.deepEqual(profileContactErrors("0512345678", " owner@example.com "), { phone: "", email: "" });
});
