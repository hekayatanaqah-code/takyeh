import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { resolveManualBookingProperty } from "./manualBookingProperty";

it("automatically chooses the sole property's submission ID", () => {
  assert.equal(resolveManualBookingProperty([{ id: 17 }]), "17");
  assert.equal(resolveManualBookingProperty([{ id: 17 }], "", "900"), "17");
  assert.equal(resolveManualBookingProperty([{ id: 17 }], "900"), "17");
});

it("requires a manual selection for multiple properties unless opened for a specific property", () => {
  const properties = [{ id: 17 }, { id: 23 }];
  assert.equal(resolveManualBookingProperty(properties), "");
  assert.equal(resolveManualBookingProperty(properties, "", "23"), "23");
  assert.equal(resolveManualBookingProperty(properties, "17", "23"), "17");
  assert.equal(resolveManualBookingProperty(properties, "", "900"), "");
});

it("handles loading, reopening, inventory changes and refetches without keeping an invalid choice", () => {
  assert.equal(resolveManualBookingProperty([], "17", "17"), "");
  assert.equal(resolveManualBookingProperty([{ id: 17 }], ""), "17");
  assert.equal(resolveManualBookingProperty([{ id: 17 }, { id: 23 }], "23"), "23");
  assert.equal(resolveManualBookingProperty([{ id: 17 }, { id: 23 }], "900"), "");
  assert.equal(resolveManualBookingProperty([{ id: 23 }], "17"), "23");
});

it("wires the resolved selection into the existing booking request and shows a fixed field for one property", () => {
  const dialog = readFileSync(new URL("../components/owner/PropertyBookingDialogs.tsx", import.meta.url), "utf8");
  assert.ok(dialog.includes('useState<string>(() => resolveManualBookingProperty(submissions, "", prefilledChaletId))'));
  assert.ok(dialog.includes("setSubmissionId(current => resolveManualBookingProperty(submissions, current, prefilledChaletId))"));
  assert.ok(dialog.includes('if (!open) { setSubmissionId(""); return; }'));
  assert.match(dialog, /submissions\.length === 1 \? \(\s*<Input[\s\S]*?data-testid="manual-booking-single-property"[\s\S]*?readOnly[\s\S]*?\) : \(\s*<Select value=\{submissionId\}/);
  assert.ok(dialog.includes("const snapSubId    = submissionId;"));
  assert.ok(dialog.includes('submissionId: snapSubId && snapSubId !== "none" ? Number(snapSubId) : undefined'));
});
