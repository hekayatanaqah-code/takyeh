import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeInvitePhone, validInvitePhone } from "./photography-invite-phone";

test("invitation phone removes letters, extended characters and symbols", () => {
  assert.equal(sanitizeInvitePhone("abcéحروف!@#+()"), "");
  assert.equal(sanitizeInvitePhone("05a123-45 678"), "0512345678");
  assert.equal(sanitizeInvitePhone("٠٥١٢٣٤٥٦٧٨"), "0512345678");
  assert.equal(sanitizeInvitePhone("۰۵۱۲۳۴۵۶۷۸"), "0512345678");
});

test("typing and pasting are limited to ten digits", () => {
  assert.equal(sanitizeInvitePhone("051234567890123"), "0512345678");
  assert.equal(sanitizeInvitePhone("abc 0512345678 !"), "0512345678");
  assert.equal(sanitizeInvitePhone(""), "");
  assert.equal(sanitizeInvitePhone("05"), "05");
});

test("only complete local Saudi mobile numbers can create an invitation", () => {
  assert.equal(validInvitePhone("0512345678"), true);
  assert.equal(validInvitePhone("0598765432"), true);
  for (const value of ["", "0", "05", "051234567", "05123456789", "0712345678",
    "5012345678", "966512345678", "+966512345678", "05a2345678", "٠٥١٢٣٤٥٦٧٨"]) {
    assert.equal(validInvitePhone(value), false, value);
  }
});
