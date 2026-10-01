import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPublicStaffUsername,
  classifyRecoveryIdentifier,
  createRecoveryRateLimiter,
  hashRecoveryToken,
  isValidRecoveryPassword,
  makePasswordResetUrl,
  normalizeRecoveryEmail,
  normalizeSaudiMobile,
} from "./passwordRecovery";
import {
  createPasswordResetEmailProvider,
  unavailableWhatsAppResetProvider,
} from "./passwordResetDelivery";

describe("password recovery input and token utilities", () => {
  it("normalizes Saudi mobiles across international, Arabic, Persian, and formatted inputs", () => {
    assert.equal(normalizeSaudiMobile("050 123 4567"), "0501234567");
    assert.equal(normalizeSaudiMobile("+966 50 123 4567"), "0501234567");
    assert.equal(normalizeSaudiMobile("00966-50-123-4567"), "0501234567");
    assert.equal(normalizeSaudiMobile("٠٥٠١٢٣٤٥٦٧"), "0501234567");
    assert.equal(normalizeSaudiMobile("۰۵۰۱۲۳۴۵۶۷"), "0501234567");
    assert.equal(normalizeSaudiMobile("050123456"), null);
    assert.equal(normalizeSaudiMobile("0511234567"), null);
    assert.equal(normalizeSaudiMobile("+966 50 123 4567"), "0501234567");
  });

  it("classifies valid email/phone and preserves the isolated staff username path", () => {
    assert.equal(normalizeRecoveryEmail(" Owner@Example.com "), "owner@example.com");
    assert.deepEqual(classifyRecoveryIdentifier(" OWNER@Example.com ", "public"), {
      kind: "email", value: "owner@example.com",
    });
    assert.deepEqual(classifyRecoveryIdentifier("٠٥٠١٢٣٤٥٦٧", "public"), {
      kind: "phone", value: "0501234567",
    });
    assert.deepEqual(classifyRecoveryIdentifier("staff.name_1", "public"), {
      kind: "username", value: "staff.name_1",
    });
    assert.deepEqual(classifyRecoveryIdentifier("123staff", "public"), {
      kind: "username", value: "123staff",
    });
    assert.deepEqual(classifyPublicStaffUsername("123456"), {
      kind: "username", value: "123456",
    });
    assert.deepEqual(classifyPublicStaffUsername("0501234567"), {
      kind: "username", value: "0501234567",
    });
    assert.deepEqual(classifyPublicStaffUsername("staff@example.test"), {
      kind: "username", value: "staff@example.test",
    });
    assert.equal(classifyPublicStaffUsername("invalid username"), null);
    assert.equal(classifyRecoveryIdentifier("not an email@", "public"), null);
    assert.equal(classifyRecoveryIdentifier("05-123", "public"), null);
    assert.equal(classifyRecoveryIdentifier("123456789", "public"), null);
  });

  it("hashes reset tokens, keeps password bounds, and creates links only on trusted origins", () => {
    const previousResetUrl = process.env.PASSWORD_RESET_PUBLIC_URL;
    const previousPublicUrl = process.env.PUBLIC_URL;
    try {
      process.env.PASSWORD_RESET_PUBLIC_URL = "javascript:alert(1)";
      process.env.PUBLIC_URL = "https://public.example.com/some/path";
      const link = new URL(makePasswordResetUrl("opaque-token", "admin"));
      assert.equal(link.origin, "https://public.example.com");
      assert.equal(link.pathname, "/reset-password");
      assert.equal(link.searchParams.get("portalType"), "admin");
      assert.equal(link.searchParams.get("token"), "opaque-token");

      delete process.env.PUBLIC_URL;
      assert.equal(new URL(makePasswordResetUrl("x", "public")).origin, "https://takyah.replit.app");
    } finally {
      if (previousResetUrl === undefined) delete process.env.PASSWORD_RESET_PUBLIC_URL;
      else process.env.PASSWORD_RESET_PUBLIC_URL = previousResetUrl;
      if (previousPublicUrl === undefined) delete process.env.PUBLIC_URL;
      else process.env.PUBLIC_URL = previousPublicUrl;
    }

    assert.equal(hashRecoveryToken("token").includes("token"), false);
    assert.equal(hashRecoveryToken("token").length, 64);
    assert.equal(isValidRecoveryPassword("12345"), false);
    assert.equal(isValidRecoveryPassword("123456"), true);
    assert.equal(isValidRecoveryPassword("x".repeat(72)), true);
    assert.equal(isValidRecoveryPassword("x".repeat(73)), false);
    assert.equal(isValidRecoveryPassword("ك".repeat(37)), false);
  });

  it("limits both IP and hashed identifier buckets", () => {
    const limiter = createRecoveryRateLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(limiter.allow("ip-one", "identifier-one", 1_000), true);
    }
    assert.equal(limiter.allow("ip-two", "identifier-one", 1_000), false);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(limiter.allow("ip-one", `identifier-${attempt}`, 1_000), true);
    }
    assert.equal(limiter.allow("ip-one", "identifier-new", 1_000), false);
    assert.equal(limiter.allow("ip-new", "identifier-new", 901_001), true);
  });
});

describe("password reset delivery seams", () => {
  it("sends a real message through an injected SMTP transport without exposing SMTP errors", async () => {
    const sent: Array<{ to: string; text: string; html: string }> = [];
    let closed = false;
    const provider = createPasswordResetEmailProvider({
      async loadConfig() {
        return {
          host: "smtp.example.net",
          port: 587,
          secure: false,
          username: "sender@example.net",
          fromAddress: "sender@example.net",
          password: "secret",
        };
      },
      async verifyConfig() { return true; },
      async resolveAddresses() {
        return ["203.0.113.9"];
      },
      createTransport() {
        return {
          async sendMail(message) {
            sent.push(message);
          },
          close() {
            closed = true;
          },
        };
      },
    });

    const sender = await provider.prepare();
    assert(sender);
    await sender.send("owner@example.net", "https://takyah.replit.app/reset-password?token=secret");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "owner@example.net");
    assert.match(sent[0]?.text ?? "", /token=secret/);
    assert.equal(closed, true);

    const failing = createPasswordResetEmailProvider({
      async loadConfig() {
        return {
          host: "smtp.example.net", port: 587, secure: false,
          username: "sender", fromAddress: "sender@example.net", password: "secret",
        };
      },
      async verifyConfig() { return true; },
      async resolveAddresses() { return ["203.0.113.9"]; },
      createTransport() {
        return {
          async sendMail() { throw new Error("secret=do-not-surface"); },
          close() {},
        };
      },
    });
    const failingSender = await failing.prepare();
    assert(failingSender);
    await assert.rejects(failingSender.send("owner@example.net", "https://example.test"), {
      message: "password_reset_email_delivery_failed",
    });
  });

  it("requires cached SMTP verification during provider preparation", async () => {
    let verifyCalls = 0;
    let transportCreated = false;
    const provider = createPasswordResetEmailProvider({
      async loadConfig() {
        return {
          host: "smtp.example.net",
          port: 587,
          secure: false,
          username: "sender@example.net",
          fromAddress: "sender@example.net",
          password: "secret",
        };
      },
      async verifyConfig() {
        verifyCalls += 1;
        return false;
      },
      async resolveAddresses() { return ["203.0.113.9"]; },
      createTransport() {
        transportCreated = true;
        throw new Error("transport should not be created");
      },
    });

    assert.equal(await provider.prepare(), null);
    assert.equal(verifyCalls, 1);
    assert.equal(transportCreated, false);
  });

  it("explicitly reports WhatsApp as unavailable until a real provider is configured", async () => {
    assert.equal(await unavailableWhatsAppResetProvider.prepare(), null);
  });
});