import assert from "node:assert/strict";
import { test } from "node:test";
import { initialDraft, photographerDraft, profileDraftReducer as reduce, sameDraftValue } from "./profileDraft";
import type { Photographer } from "./shared";

const person: Photographer = {
  id: 1, name: "Test", whatsapp: "", status: "approved", bio: "Saved bio",
  regionId: 1, cityId: 2, districtIds: [3], allDistricts: false,
  sessionMinutes: 90, availability: [{ weekday: 0, start: "09:00", end: "17:00" }],
  adminNote: "", iban: "saved-iban", bankName: "Saved bank",
};
const base = photographerDraft(person);
const incoming = photographerDraft({ ...person, bio: "Admin bio", iban: "admin-iban", bankName: "Admin bank", email: "new@example.test", allDistricts: true });
function edited() {
  let state = initialDraft(base);
  state = reduce(state, { type: "edit", group: "prof", update: prof => ({ ...prof, bio: "My unsaved bio" }) });
  return reduce(state, { type: "edit", group: "bank", update: () => ({ iban: "draft-iban", bankName: "Draft bank" }) });
}

test("polling preserves bio and bank drafts until an explicit resolution", () => {
  const state = edited();
  const updated = reduce(state, { type: "receive", latest: incoming, busy: false });
  assert.deepEqual(updated.draft, state.draft);
  assert.deepEqual(updated.baseline, base);
  assert.deepEqual(updated.latest, incoming);
  assert.equal(reduce(updated, { type: "receive", latest: incoming, busy: false }), updated);
});
test("explicit merge keeps edited fields and dependent groups, updates untouched fields", () => {
  const state = reduce(reduce(edited(), { type: "receive", latest: incoming, busy: false }), { type: "merge" });
  assert.equal(state.draft.prof.bio, "My unsaved bio");
  assert.equal(state.draft.prof.email, "new@example.test");
  assert.deepEqual(state.draft.bank, edited().draft.bank);
  assert.deepEqual(state.draft.geo, incoming.geo);
  assert.deepEqual(state.baseline, incoming);
});
test("coverage is merged atomically, bank is never partly mixed", () => {
  let state = reduce(initialDraft(base), { type: "edit", group: "geo", update: geo => ({ ...geo, districtIds: [4] }) });
  state = reduce(state, { type: "edit", group: "bank", update: bank => ({ ...bank, iban: "local-iban" }) });
  const local = state.draft;
  state = reduce(reduce(state, { type: "receive", latest: incoming, busy: false }), { type: "merge" });
  assert.deepEqual(state.draft.geo, local.geo);
  assert.deepEqual(state.draft.bank, local.bank);
});
test("replace discards only after explicit action, using most recent poll", () => {
  let state = reduce(edited(), { type: "receive", latest: incoming, busy: false });
  const latest = photographerDraft({ ...person, bio: "Second admin update" });
  state = reduce(state, { type: "receive", latest, busy: false });
  assert.deepEqual(reduce(state, { type: "replace" }), initialDraft(latest));
});
test("clean forms synchronize automatically, including allDistricts", () => {
  assert.deepEqual(reduce(initialDraft(base), { type: "receive", latest: incoming, busy: false }), initialDraft(incoming));
});
test("uploading protects a clean draft until the upload settles", () => {
  const state = reduce(initialDraft(base), { type: "receive", latest: incoming, busy: true });
  assert.deepEqual(state.draft, base);
  assert.deepEqual(reduce(state, { type: "receive", latest: incoming, busy: false }), initialDraft(incoming));
});
test("successful saves hydrate normalized response and clear dirty/conflict state", () => {
  const state = reduce(reduce(edited(), { type: "receive", latest: incoming, busy: true }), { type: "saved", saved: incoming });
  assert.deepEqual(state, initialDraft(incoming));
  assert.ok(sameDraftValue(state.draft, state.baseline));
  const next = photographerDraft({ ...person, bio: "Later update" });
  assert.deepEqual(reduce(state, { type: "receive", latest: next, busy: false }), initialDraft(next));
});
test("a new account starts from its own values, never the previous draft", () => {
  const other = photographerDraft({ ...person, id: 2, bio: "Other account", iban: null, bankName: null });
  assert.notDeepEqual(initialDraft(other).draft, edited().draft);
  assert.equal(initialDraft(other).draft.bank.iban, "");
});
