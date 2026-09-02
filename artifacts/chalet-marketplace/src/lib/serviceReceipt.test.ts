import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getServiceClientIdField,
  getServiceReceiptFinancialSummary,
  servicePaymentMethodLabel,
  serviceReceiptMoney,
  serviceReceiptNumber,
  shouldShowServiceClientId,
} from "./serviceReceipt";

describe("service receipt contract", () => {
  it("keeps the receipt number tied to the appointment id", () => {
    const appointment = { id: 481, amount: "1250", deposit: "300" };
    const initialNumber = serviceReceiptNumber(appointment);

    assert.equal(initialNumber, "٤٨١");
    assert.equal(
      serviceReceiptNumber({ ...appointment, amount: "1450", deposit: "500" }),
      initialNumber,
    );
  });

  it("calculates total, deposit, remaining balance, and payment method", () => {
    const summary = getServiceReceiptFinancialSummary({
      amount: "1250",
      deposit: "300",
      paymentMethod: "transfer",
    });

    assert.deepEqual(summary, {
      total: 1250,
      deposit: 300,
      remaining: 950,
      paymentMethodLabel: "حوالة بنكية",
    });
    assert.equal(serviceReceiptMoney(summary.total), "١٬٢٥٠ ر.س");
    assert.equal(servicePaymentMethodLabel("pos"), "شبكة / نقاط بيع");
  });

  it("shows the client identity only for insured services", () => {
    assert.equal(shouldShowServiceClientId(false), false);
    assert.equal(getServiceClientIdField(false, "1098765432"), null);
    assert.deepEqual(getServiceClientIdField(true, "1098765432"), {
      label: "رقم الهوية / الإقامة",
      value: "1098765432",
    });
  });
});