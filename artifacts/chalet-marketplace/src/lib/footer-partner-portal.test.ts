import test from "node:test";
import assert from "node:assert/strict";
import { getFooterPartnerPortal } from "./footer-partner-portal";

test("visitors retain the existing partner login action and description", () => {
  assert.deepEqual(getFooterPartnerPortal(true, false, false), {
    href: "/login",
    label: "دخول الشركاء",
    description: "بوابة الشركاء - دخول أصحاب الوجهات ومزودي الخدمات لإدارة الحجوزات والخدمات",
  });
});

test("authenticated partners go directly to the same dashboard as the header", () => {
  const portal = getFooterPartnerPortal(true, false, true);
  assert.equal(portal?.href, "/dashboard");
  assert.equal(portal?.label, "لوحة التحكم");
  assert(!portal?.description.includes("دخول"));
});

test("the login invitation never flashes while checking the session", () => {
  assert.equal(getFooterPartnerPortal(true, true, false), null);
  assert.equal(getFooterPartnerPortal(true, true, true), null);
});

test("neither visitors nor authenticated partners see the portal on inner pages", () => {
  assert.equal(getFooterPartnerPortal(false, false, false), null);
  assert.equal(getFooterPartnerPortal(false, false, true), null);
});

test("the action follows login and logout state instead of retaining a stale label", () => {
  assert.equal(getFooterPartnerPortal(true, false, false)?.href, "/login");
  assert.equal(getFooterPartnerPortal(true, false, true)?.href, "/dashboard");
  assert.equal(getFooterPartnerPortal(true, false, false)?.href, "/login");
});
