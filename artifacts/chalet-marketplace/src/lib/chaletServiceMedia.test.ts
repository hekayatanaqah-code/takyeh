import assert from "node:assert/strict";
import { test } from "node:test";
import { moveServicePhoto, serviceImageError, SERVICE_IMAGE_MAX_BYTES } from "./chaletServiceMedia";

test("image validation matches the real two-megabyte server limit", () => {
  assert.equal(serviceImageError({ type: "image/png", size: SERVICE_IMAGE_MAX_BYTES }), null);
  assert.match(serviceImageError({ type: "image/png", size: SERVICE_IMAGE_MAX_BYTES + 1 })!, /2MB/);
  assert(serviceImageError({ type: "application/pdf", size: 100 }));
});
test("image reordering retains image/caption identity and never mutates the source", () => {
  const photos = [{ id: "a", caption: "الأولى" }, { id: "b", caption: "الثانية" }, { id: "c", caption: "الثالثة" }];
  const moved = moveServicePhoto(photos, 2, 0);
  assert.deepEqual(moved.map(photo => photo.id), ["c", "a", "b"]);
  assert.equal(moved[0].caption, "الثالثة");
  assert.deepEqual(photos.map(photo => photo.id), ["a", "b", "c"]);
  assert.equal(moveServicePhoto(photos, 0, -1), photos);
  assert.equal(moveServicePhoto(photos, 2, 3), photos);
});
