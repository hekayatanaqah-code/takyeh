import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPublicSmtpAddress,
  isSafeSmtpHostInput,
  isSafeSmtpTransport,
  resolvePublicSmtpAddresses,
  ShortTtlVerificationCache,
  smtpAuthenticationDestinationMatches,
  decryptBroadcastSmtpPassword,
  encryptBroadcastSmtpPassword,
} from "./broadcast-smtp-config";

describe("broadcast SMTP password vault", () => {
  it("encrypts at rest and decrypts with the session-secret fallback", () => {
    const previous = process.env.SESSION_SECRET;
    delete process.env.BROADCAST_SMTP_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = "smtp-vault-test-session-secret";
    try {
      const encrypted = encryptBroadcastSmtpPassword("smtp-password-value");
      assert(encrypted);
      assert.match(encrypted, /^v1s\./);
      assert.equal(encrypted.includes("smtp-password-value"), false);
      assert.equal(decryptBroadcastSmtpPassword(encrypted), "smtp-password-value");
      assert.equal(decryptBroadcastSmtpPassword(`${encrypted.slice(0, -2)}xx`), null);
    } finally {
      if (previous === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previous;
    }
  });

  it("prefers a dedicated key and does not decrypt with a rotated key", () => {
    const previousSession = process.env.SESSION_SECRET;
    const previousDedicated = process.env.BROADCAST_SMTP_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = "smtp-vault-test-session-secret";
    process.env.BROADCAST_SMTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const encrypted = encryptBroadcastSmtpPassword("rotatable-password");
      assert(encrypted);
      assert.match(encrypted, /^v1d\./);
      process.env.SESSION_SECRET = "rotated-session-secret";
      assert.equal(decryptBroadcastSmtpPassword(encrypted), "rotatable-password");
      process.env.BROADCAST_SMTP_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
      assert.equal(decryptBroadcastSmtpPassword(encrypted), null);
    } finally {
      if (previousSession === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSession;
      if (previousDedicated === undefined) delete process.env.BROADCAST_SMTP_ENCRYPTION_KEY;
      else process.env.BROADCAST_SMTP_ENCRYPTION_KEY = previousDedicated;
    }
  });

  it("fails closed when encryption material or password is missing", () => {
    const previousSession = process.env.SESSION_SECRET;
    const previousDedicated = process.env.BROADCAST_SMTP_ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;
    delete process.env.BROADCAST_SMTP_ENCRYPTION_KEY;
    try {
      assert.equal(encryptBroadcastSmtpPassword("password"), null);
      assert.equal(encryptBroadcastSmtpPassword(""), null);
      assert.equal(decryptBroadcastSmtpPassword("not-a-vault-value"), null);
    } finally {
      if (previousSession !== undefined) process.env.SESSION_SECRET = previousSession;
      if (previousDedicated !== undefined) process.env.BROADCAST_SMTP_ENCRYPTION_KEY = previousDedicated;
    }
  });

  it("requires a fresh secret if the SMTP authentication destination changes", () => {
    const oldSettings = { host: "smtp.example.net", port: 587, username: "sender@example.net" };
    assert.equal(smtpAuthenticationDestinationMatches(oldSettings, {
      host: "SMTP.EXAMPLE.NET.", port: 587, username: "sender@example.net",
    }), true);
    assert.equal(smtpAuthenticationDestinationMatches(oldSettings, {
      host: "other.example.net", port: 587, username: "sender@example.net",
    }), false);
    assert.equal(smtpAuthenticationDestinationMatches(oldSettings, {
      host: "smtp.example.net", port: 465, username: "sender@example.net",
    }), false);
    assert.equal(smtpAuthenticationDestinationMatches(oldSettings, {
      host: "smtp.example.net", port: 587, username: "different@example.net",
    }), false);
  });

  it("allows only safe SMTP ports and blocks private or special-use addresses", () => {
    assert.equal(isSafeSmtpTransport(465, true), true);
    assert.equal(isSafeSmtpTransport(587, false), true);
    assert.equal(isSafeSmtpTransport(2525, false), true);
    assert.equal(isSafeSmtpTransport(25, false), false);
    assert.equal(isSafeSmtpTransport(22, true), false);
    assert.equal(isSafeSmtpHostInput("localhost"), false);
    assert.equal(isSafeSmtpHostInput("smtp.internal.example"), false);
    assert.equal(isSafeSmtpHostInput("smtp.example.net"), true);
    for (const address of [
      "10.1.2.3", "127.0.0.1", "169.254.10.20", "172.20.1.1", "192.168.1.2",
      "100.64.0.1", "224.0.0.1", "::1", "fc00::1", "fe80::1",
      "::ffff:127.0.0.1", "2001:db8::1",
    ]) assert.equal(isPublicSmtpAddress(address), false, `${address} must not be public`);
    assert.equal(isPublicSmtpAddress("8.8.8.8"), true);
    assert.equal(isPublicSmtpAddress("2001:4860:4860::8888"), true);
  });

  it("rejects DNS answers containing private addresses and returns only validated public pins", async () => {
    const publicAddresses = await resolvePublicSmtpAddresses("smtp.example.net", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ]);
    assert.deepEqual(publicAddresses, ["8.8.8.8", "2001:4860:4860::8888"]);
    await assert.rejects(
      resolvePublicSmtpAddresses("smtp.example.net", async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "192.168.1.20", family: 4 },
      ]),
      /smtp_destination_not_public/,
    );
    await assert.rejects(
      resolvePublicSmtpAddresses("smtp.example.net", async () => []),
      /smtp_destination_not_public/,
    );
  });

  it("coalesces in-flight verification and reuses short-lived results by fingerprint", async () => {
    const cache = new ShortTtlVerificationCache(1000, 100);
    let runs = 0;
    let finish!: (result: boolean) => void;
    const verifier = () => {
      runs++;
      return new Promise<boolean>(resolve => { finish = resolve; });
    };
    const first = cache.verify("config-fingerprint", verifier);
    const second = cache.verify("config-fingerprint", verifier);
    await Promise.resolve();
    assert.equal(runs, 1);
    finish(true);
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(await cache.verify("config-fingerprint", verifier), true);
    assert.equal(runs, 1);
    cache.clear();
    const afterInvalidation = cache.verify("config-fingerprint", async () => {
      runs++;
      return false;
    });
    assert.equal(await afterInvalidation, false);
    assert.equal(runs, 2);
  });
});