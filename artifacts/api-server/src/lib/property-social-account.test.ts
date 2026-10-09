import assert from "node:assert/strict";
import { test } from "node:test";
import { socialAccountIdentity } from "./property-social-account";

test("Instagram profile formats describe one account independent of tracking and case", () => {
  for (const value of [
    "https://www.instagram.com/Example_Chalet/",
    "instagram.com/example_chalet?igsh=ignored",
    "https://m.instagram.com/example_chalet/#ignored",
    "instagram:@example_chalet",
  ]) {
    assert.deepEqual(socialAccountIdentity(value), { platform: "instagram", username: "example_chalet" });
  }
});

test("Snapchat URL and explicit handle identify one account", () => {
  for (const value of [
    "https://www.snapchat.com/add/Example-Chalet/?share_id=ignored",
    "snapchat.com/@example-chalet",
    "snapchat:example-chalet",
  ]) {
    assert.deepEqual(socialAccountIdentity(value), { platform: "snapchat", username: "example-chalet" });
  }
});

test("a bare handle does not invent a platform", () => {
  for (const value of ["@example.chalet", " example.chalet "]) {
    assert.deepEqual(socialAccountIdentity(value), { platform: null, username: "example.chalet" });
  }
});

test("different explicit platforms remain different accounts", () => {
  assert.notDeepEqual(socialAccountIdentity("instagram:chalet"), socialAccountIdentity("snapchat:chalet"));
});

test("reject unrelated URLs and posts rather than treating them as profiles", () => {
  for (const value of [
    "", " @ ", "https://example.com/chalet", "https://instagram.com.evil.com/chalet",
    "https://instagram.com/p/some-post", "https://instagram.com/reel/some-post",
    "https://snapchat.com/t/shared-link", "user name", "instagram:",
  ]) assert.equal(socialAccountIdentity(value), null, value);
});
