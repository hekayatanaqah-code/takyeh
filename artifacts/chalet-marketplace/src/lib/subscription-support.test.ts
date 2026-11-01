import { test } from "node:test";
import assert from "node:assert/strict";
import { subscriptionSupportLink, SUBSCRIPTION_SUPPORT_MESSAGE } from "./subscription-support";

test("official configured phone supports local, international and Arabic digits", () => {
  for (const value of ["0512345678", "٥١٢٣٤٥٦٧٨", "+966 51 234 5678", "00966-51-234-5678", "۰۵۱۲۳۴۵۶۷۸"]) {
    const link = new URL(subscriptionSupportLink(value)!);
    assert.equal(link.hostname, "wa.me");
    assert.equal(link.pathname, "/966512345678");
    assert.equal(link.searchParams.get("text"), SUBSCRIPTION_SUPPORT_MESSAGE);
    assert.match(link.searchParams.get("text")!, /منصة تكيّة/);
    assert.doesNotMatch(link.searchParams.get("text")!, /حكاية/);
  }
});
test("missing or invalid public contact never creates a fake destination", () => {
  for (const value of [undefined, null, "", "غير محدد", "123", "00000000"]) {
    assert.equal(subscriptionSupportLink(value), null);
  }
  assert.notEqual(subscriptionSupportLink("0512345678"), subscriptionSupportLink("0555555555"));
});
