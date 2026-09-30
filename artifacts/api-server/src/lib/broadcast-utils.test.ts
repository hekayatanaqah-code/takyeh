import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultBroadcastPreferences,
  deduplicateRecipients,
  emailDeliveryBlockReason,
  idempotencyPayloadMatches,
  mergeBroadcastPreferences,
  normalizeE164Phone,
  ownerIdentityAliases,
  optedInBroadcastChannels,
  recipientKeyForAlias,
  selectAudienceOwnerIds,
} from "./broadcast-utils";

describe("broadcast recipient and retry helpers", () => {
  it("canonicalizes legacy owner_N and mapped user aliases to one deduplicated recipient", () => {
    const canonical = { key: "app:17" };
    const aliases = new Map([
      ["owner_17", canonical],
      ["replit-user-abc", canonical],
    ]);
    const records = [
      { ...canonical, ownerId: "replit-user-abc" },
      { key: recipientKeyForAlias("owner_17", aliases), ownerId: "replit-user-abc" },
    ];

    assert.equal(recipientKeyForAlias("owner_17", aliases), "app:17");
    assert.equal(recipientKeyForAlias("replit-user-abc", aliases), "app:17");
    const unique = deduplicateRecipients(records);
    assert.equal(unique.length, 1);
    assert.equal(unique[0].key, "app:17");
  });

  it("returns both durable and legacy owner IDs for authorized inbox and notification reads", () => {
    assert.deepEqual(ownerIdentityAliases("owner_17", "replit-user-abc"), ["owner_17", "replit-user-abc"]);
    assert.deepEqual(ownerIdentityAliases("replit-user-abc", "owner_17"), ["replit-user-abc", "owner_17"]);
    assert.deepEqual(ownerIdentityAliases("standalone-user", null), ["standalone-user"]);
  });

  it("keeps marketing channels opt-in by default and merges independent preferences", () => {
    assert.deepEqual(defaultBroadcastPreferences(), {
      inApp: true, inbox: false, email: false, whatsapp: false,
    });
    assert.deepEqual(mergeBroadcastPreferences(defaultBroadcastPreferences(), { inbox: true, email: true }), {
      inApp: true, inbox: true, email: true, whatsapp: false,
    });
  });

  it("filters recipient channels by the requested selection and stored opt-ins", () => {
    const preferences = {
      inApp: true, inbox: true, email: false, whatsapp: true,
    };
    assert.deepEqual(optedInBroadcastChannels(preferences), ["inApp", "inbox", "whatsapp"]);
    assert.deepEqual(optedInBroadcastChannels(preferences, ["email", "whatsapp"]), ["whatsapp"]);
    assert.deepEqual(optedInBroadcastChannels(preferences, []), []);
  });

  it("selects all, active-subscriber, and approved-provider account sources without customer IDs", () => {
    const sources = {
      chaletOwners: ["owner_17", "oidc-owner"],
      providers: ["owner_17", "provider-user"],
      activeSubscribers: ["oidc-owner", "subscription-only-user"],
    };
    assert.deepEqual(selectAudienceOwnerIds("all", sources), [
      "owner_17", "oidc-owner", "provider-user", "subscription-only-user",
    ]);
    assert.deepEqual(selectAudienceOwnerIds("active", sources), ["oidc-owner", "subscription-only-user"]);
    assert.deepEqual(selectAudienceOwnerIds("providers", sources), ["owner_17", "provider-user"]);
    assert.deepEqual(selectAudienceOwnerIds("all", {
      chaletOwners: ["approved-property-owner"], providers: [], activeSubscribers: [],
    }), ["approved-property-owner"]);
  });

  it("allows a same-payload retry but rejects reusing its idempotency key for different content", () => {
    const payload = { title: "Notice", body: "Platform update", audience: "all", channels: ["inApp", "email"] };
    assert.equal(idempotencyPayloadMatches(payload, { ...payload }), true);
    assert.equal(idempotencyPayloadMatches(payload, { ...payload, body: "Different notice" }), false);
  });

  it("blocks queued email after opt-out and rejects a missing or invalid current address", () => {
    assert.equal(emailDeliveryBlockReason("owner@example.com", false), "marketing_opted_out");
    assert.equal(emailDeliveryBlockReason(null, true), "email_missing_or_invalid");
    assert.equal(emailDeliveryBlockReason("not-an-email", true), "email_missing_or_invalid");
    assert.equal(emailDeliveryBlockReason("owner@example.com", true), null);
  });

  it("accepts only strict E.164 phone strings", () => {
    assert.equal(normalizeE164Phone("+966512345678"), "+966512345678");
    assert.equal(normalizeE164Phone("0512345678"), null);
    assert.equal(normalizeE164Phone("+0123456789"), null);
    assert.equal(normalizeE164Phone("+966 51 234 5678"), null);
  });
});