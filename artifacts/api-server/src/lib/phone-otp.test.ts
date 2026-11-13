import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPhoneOtp, issuePhoneOtp, normalizePhoneOtp } from "./phone-otp";
import { isTaqnyatAccepted } from "../../../../taqnyatWhatsApp.js";

test("delivery uses exactly the code whose hash was persisted, without returning it", async () => {
  let stored = "";
  let sent = "";
  const before = Date.now();
  const result = await issuePhoneOtp("0500000000", async (hash, expiry) => {
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.ok(expiry.getTime() >= before + 600000);
    stored = hash;
  }, async (phone, code) => {
    assert.equal(phone, "0500000000");
    assert.match(code, /^\d{4}$/);
    assert.equal(hashPhoneOtp(code), stored, "persist before delivery");
    sent = code;
    return { success: true };
  });
  assert.equal(stored, hashPhoneOtp(sent));
  assert.equal(result, undefined, "never return a raw OTP to an API caller");
});

test("Arabic and English digits produce the same verification hash, including leading zero", () => {
  assert.equal(normalizePhoneOtp(" ٠١٢٣ "), "0123");
  assert.equal(hashPhoneOtp(normalizePhoneOtp("٠١٢٣")), hashPhoneOtp("0123"));
  assert.notEqual(hashPhoneOtp("0123"), hashPhoneOtp("123"));
});

test("delivery rejection propagates to the transaction so the caller can rollback", async () => {
  await assert.rejects(issuePhoneOtp("0500000000", async () => {}, async () => ({
    success: false,
  })), /PHONE_OTP_DELIVERY_FAILED/);
});

test("failed persistence must never send an unverifiable WhatsApp code", async () => {
  let delivered = false;
  await assert.rejects(issuePhoneOtp("0500000000", async () => {
    throw new Error("database rejected");
  }, async () => {
    delivered = true;
    return { success: true };
  }), /database rejected/);
  assert.equal(delivered, false);
});

test("documented Taqnyat acknowledgement does not reject a stored OTP", async () => {
  let stored = "";
  let sent = "";
  await issuePhoneOtp("0500000000", async hash => {
    stored = hash;
  }, async (_phone, code) => {
    sent = code;
    return {
      success: isTaqnyatAccepted(true, {
        type: "whatsapp",
        statuses: [{ message_id: "wamid.test-fixture", recipient: "+966500000000" }],
      }),
    };
  });
  assert.equal(stored, hashPhoneOtp(sent));
});

test("actual single-status template acknowledgement preserves the verifiable OTP", async () => {
  let stored = "";
  let sent = "";
  await issuePhoneOtp("0500000000", async hash => {
    stored = hash;
  }, async (_phone, code) => {
    sent = code;
    return {
      success: isTaqnyatAccepted(true, {
        type: "template",
        statuses: { message_id: "wamid.test-fixture", recipient: "+966500000000" },
      }),
    };
  });
  assert.match(sent, /^\d{4}$/);
  assert.equal(stored, hashPhoneOtp(normalizePhoneOtp(sent)));
});
