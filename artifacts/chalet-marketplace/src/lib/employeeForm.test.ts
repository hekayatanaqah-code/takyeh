import assert from "node:assert/strict";
import { test } from "node:test";
import { employeeDigits, employeeMobileInput, EMPTY_NEW_STAFF_FORM, validEmployeeMobile, validEmployeeNationalId } from "./employeeForm";

test("employee mobile starts with 05 and preserves that prefix on clearing and editing", () => {
  assert.equal(EMPTY_NEW_STAFF_FORM.phoneNum, "05");
  for (const input of ["", "0", "05", "abc", "٠٥"]) assert.equal(employeeMobileInput(input), "05");
  assert.equal(employeeMobileInput("12345678"), "0512345678");
  assert.equal(employeeMobileInput("٥١٢٣٤٥٦٧٨"), "0512345678");
});

test("employee input strips letters/symbols, accepts Eastern digits and caps at ten digits", () => {
  assert.equal(employeeDigits("١٢٣٤a-٥٦٧٨٩٠١"), "1234567890");
  assert.equal(employeeDigits("۱۲۳۴۵۶۷۸۹۰"), "1234567890");
  assert.equal(employeeMobileInput("٠٥١٢a٣-٤٥٦٧٨٩٩"), "0512345678");
  assert.equal(employeeMobileInput("+966512345678"), "0512345678");
  assert.equal(employeeMobileInput("00966512345678"), "0512345678");
});

test("partial phone and identity values cannot be saved; a blank optional identity is allowed", () => {
  assert.equal(validEmployeeMobile("0512345678"), true);
  for (const value of ["05", "051234567", "05123456789", "1234567890", "05123a5678"]) {
    assert.equal(validEmployeeMobile(value), false, value);
  }
  assert.equal(validEmployeeNationalId("1234567890"), true);
  assert.equal(validEmployeeNationalId(""), true);
  for (const value of ["1", "123456789", "12345678901", "123a567890", "123-567890"]) {
    assert.equal(validEmployeeNationalId(value), false, value);
  }
});
