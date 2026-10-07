import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesOwnerDirectoryTab, ownerWhatsAppUrl } from "./owner-directory";

describe("owner directory", () => {
  const empty = { ownerKind: "none", isRegistered: true, hasActivity: false } as const;
  it("includes newly registered accounts in all and no-activity tabs", () => {
    assert.equal(matchesOwnerDirectoryTab(empty, "all"), true);
    assert.equal(matchesOwnerDirectoryTab(empty, "none"), true);
    assert.equal(matchesOwnerDirectoryTab(empty, "property"), false);
  });
  it("does not misclassify an unapproved submission as no activity", () => {
    const pending = { ...empty, hasActivity: true };
    assert.equal(matchesOwnerDirectoryTab(pending, "all"), true);
    assert.equal(matchesOwnerDirectoryTab(pending, "none"), false);
  });
  it("keeps legacy inventory visible without counting it as a new registration", () => {
    assert.equal(matchesOwnerDirectoryTab({ ...empty, isRegistered: false }, "none"), false);
    const mixed = { ownerKind: "both", isRegistered: true, hasActivity: true } as const;
    assert.equal(matchesOwnerDirectoryTab(mixed, "both"), true);
    assert.equal(matchesOwnerDirectoryTab(mixed, "none"), false);
  });
  it("builds international WhatsApp links for local, international and Arabic digits", () => {
    for (const input of ["0500000000", "+966 50 000 0000", "00966500000000", "٠٥٠٠٠٠٠٠٠٠", "500000000"]) {
      assert.equal(ownerWhatsAppUrl(input), "https://wa.me/966500000000");
    }
  });
  it("does not render a messaging link for missing or malformed phones", () => {
    for (const input of ["", "not-a-phone", "123", "mailto:test@example.com"]) {
      assert.equal(ownerWhatsAppUrl(input), null);
    }
  });
});
