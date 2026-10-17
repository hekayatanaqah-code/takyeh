import { test } from "node:test";
import assert from "node:assert/strict";
import { contractMoney, contractTermsText, propertyContractClauses, EMPTY_CONTRACT_TERMS, publicContractUrl, contractInvitationText, CONTRACT_STATUS_STYLES } from "./digitalContracts";

test("property clauses preserve only saved property wording, including customized former defaults", () => {
  const saved = "يُلزَم المستأجر بسداد تأمين خاص بالاتفاق\nشروط أخرى للعقار الثاني";
  const clauses = propertyContractClauses(saved);
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].text, saved);
  assert.deepEqual(propertyContractClauses(null), []);
  assert.deepEqual(propertyContractClauses("  "), []);
  assert.equal(contractTermsText(null), EMPTY_CONTRACT_TERMS);
  assert.equal(contractTermsText(saved), saved);
});

test("contract and PDF amounts preserve halalas and always use Eastern digits and official symbol", () => {
  assert.equal(contractMoney("1200.75"), "١٬٢٠٠٫٧٥ ⃁");
  assert.equal(contractMoney("125.50"), "١٢٥٫٥٠ ⃁");
  assert.equal(contractMoney(900.5), "٩٠٠٫٥٠ ⃁");
  assert.equal(contractMoney(0), "٠ ⃁");
  assert.equal(contractMoney(null), "—");
  assert.equal(contractMoney("invalid"), "—");
  assert.equal(contractTermsText("رسوم خاصة 125.50 ريال"), "رسوم خاصة ١٢٥.٥٠ ⃁");
});

test("all customer signature links use the verified published domain, not the current origin", () => {
  assert.equal(publicContractUrl(12), "https://takyah.replit.app/contract/12");
  assert.equal(publicContractUrl(12, "service", "/"), "https://takyah.replit.app/service-contract/12");
  assert.equal(publicContractUrl(12, "property", "/market/"), "https://takyah.replit.app/market/contract/12");
  assert.throws(() => publicContractUrl(-1));
  assert.throws(() => publicContractUrl(NaN));
});

test("invitation is consistent and personal without assuming gender or promising confirmation", () => {
  const text = contractInvitationText({
    clientName: "ضيف", propertyName: "العقار الثاني", day: "الأحد",
    hijri: "١ جمادى الأولى", gregorian: "١ أكتوبر", period: "مسائية", link: publicContractUrl(12),
  });
  assert.ok(text.startsWith("مرحباً ضيف"));
  assert.ok(text.includes("العقار الثاني"));
  assert.ok(text.includes("الشروط والأحكام"));
  assert.ok(text.includes("https://takyah.replit.app/contract/12"));
  assert.doesNotMatch(text, /أخونا|المبدئي|replit\.dev|localhost/);
});

test("all status variants have strong text, filled backgrounds, borders and dark support", () => {
  for (const style of Object.values(CONTRACT_STATUS_STYLES)) {
    assert.match(style, /text-\w+-950/);
    assert.match(style, /dark:text-\w+-100/);
    assert.match(style, /bg-\w+-50/);
    assert.match(style, /dark:bg-\w+-950/);
  }
});
