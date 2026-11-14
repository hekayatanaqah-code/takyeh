import assert from "node:assert/strict";
import { it } from "node:test";
import { localRegistrationPhone, registrationPhoneDigits, toAr } from "./utils";

it("displays English keyboard digits as Arabic digits", () => {
  assert.equal(toAr(registrationPhoneDigits("0501234567")), "٠٥٠١٢٣٤٥٦٧");
});
it("removes letters and limits mixed-script input to ten digits", () => {
  assert.equal(toAr(registrationPhoneDigits("abc٠٥۰12x٣4567899")), "٠٥٠١٢٣٤٥٦٧");
  assert.equal(registrationPhoneDigits("050123456789012345"), "0501234567");
});
it("preserves Arabic keyboard input without Western digits in the display", () => {
  const displayed = toAr(registrationPhoneDigits("٠٥٠١٢٣٤٥٦٧"));
  assert.match(displayed, /^[٠-٩]{10}$/);
});
it("opens saved international numbers as a complete local mobile, not a truncated prefix", () => {
  for (const number of ["+966501234567", "00966501234567", "٠٠٩٦٦٥٠١٢٣٤٥٦٧", "501234567"]) {
    assert.equal(localRegistrationPhone(number), "0501234567");
  }
});
