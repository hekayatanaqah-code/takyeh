import assert from "node:assert/strict";
import { it } from "node:test";
import { notifySubmissionDecision, type SubmissionNotice } from "./submission-whatsapp";
import { normalizeTaqnyatPhone } from "../../../../taqnyatWhatsApp.js";

const base: SubmissionNotice = {
  kind: "property", id: 1, ownerId: "owner_1", activityName: "عقار اختبار",
  phone: "٠٥٠٠٠٠٠٠٠٠", previousStatus: "pending", status: "approved",
};
it("normalizes Arabic, Persian, local and international Saudi numbers and rejects invalid destinations", () => {
  for (const phone of ["٠٥٠٠٠٠٠٠٠٠", "۰۵۰۰۰۰۰۰۰۰", "0500000000", "500000000", "+966500000000", "00966500000000"]) {
    assert.equal(normalizeTaqnyatPhone(phone), "966500000000");
  }
  for (const phone of ["", "0500", "0044500000000", "05000000000"]) assert.equal(normalizeTaqnyatPhone(phone), null);
});

it("uses owner identity/contact and correct positional template values for both activity types", async () => {
  const originalApproved = process.env.TAQNYAT_SUBMISSION_APPROVED_TEMPLATE;
  const originalRevision = process.env.TAQNYAT_SUBMISSION_REVISION_TEMPLATE;
  process.env.TAQNYAT_SUBMISSION_APPROVED_TEMPLATE = "fixture_approved";
  process.env.TAQNYAT_SUBMISSION_REVISION_TEMPLATE = "fixture_revision";
  try {
    for (const kind of ["property", "service"] as const) {
      const calls: unknown[][] = [];
      const deps = {
        findOwner: async () => ({ name: "مالك اختبار", phone: "٠٥١١١١١١١١" }),
        send: async (...args: [string, string, string[], string?]) => { calls.push(args); return { success: true }; },
      };
      const warn = () => assert.fail("No failure expected");
      assert.equal(await notifySubmissionDecision({ ...base, kind }, warn, deps), "accepted");
      assert.deepEqual(calls[0].slice(0, 3), ["966511111111", "fixture_approved", ["مالك اختبار", base.activityName]]);
      assert.equal(await notifySubmissionDecision({ ...base, kind, status: "needs_revision", adminNote: "  أضف الصور  " }, warn, deps), "accepted");
      assert.deepEqual(calls[1].slice(0, 3), ["966511111111", "fixture_revision", ["مالك اختبار", base.activityName, "أضف الصور"]]);
      assert.equal(await notifySubmissionDecision({ ...base, kind, previousStatus: "approved" }, warn, deps), "skipped");
      assert.equal(await notifySubmissionDecision({ ...base, kind, status: "rejected" }, warn, deps), "skipped");
      assert.equal(await notifySubmissionDecision({ ...base, kind, status: "needs_revision", previousStatus: "needs_revision", adminNote: "أضف الصور", previousNote: "أضف الصور" }, warn, deps), "skipped");
      assert.equal(calls.length, 2);
    }
  } finally {
    if (originalApproved === undefined) delete process.env.TAQNYAT_SUBMISSION_APPROVED_TEMPLATE;
    else process.env.TAQNYAT_SUBMISSION_APPROVED_TEMPLATE = originalApproved;
    if (originalRevision === undefined) delete process.env.TAQNYAT_SUBMISSION_REVISION_TEMPLATE;
    else process.env.TAQNYAT_SUBMISSION_REVISION_TEMPLATE = originalRevision;
  }
});

it("catches lookup errors and redacts private failure details", async () => {
  const warnings: unknown[] = [];
  const outcome = await notifySubmissionDecision(base, details => warnings.push(details), {
    findOwner: async () => { throw new Error("private-provider-contact-and-token"); },
    send: async () => assert.fail("Must not send after identity lookup fails"),
  });
  assert.equal(outcome, "failed");
  assert.equal(JSON.stringify(warnings).includes("private"), false);
});
