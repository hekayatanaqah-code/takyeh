import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import express from "express";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { db, pool, ownerAccountLinksTable, sessionsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import apiApp from "../app";
import {
  createPasswordResetRouter,
} from "./passwordReset";
import { hashRecoveryToken } from "../lib/passwordRecovery";
import {
  createPasswordResetEmailProvider,
  type PreparedResetSender,
  type ResetLinkProvider,
} from "../lib/passwordResetDelivery";

let server: Server;
let baseUrl: string;
const ownerIds: number[] = [];
const ownerStaffIds: number[] = [];
const adminIds: number[] = [];
const sessionIds: string[] = [];
const ownerLinkUserIds: string[] = [];
const userIds: string[] = [];
const staffSessionIds: string[] = [];
const adminSessionIds: string[] = [];
let staleIssueRace: { ownerId: number; passwordHash: string } | null = null;
let defaultClientAddress = 0;
const staleIssueDatabase = new Proxy(db, {
  get(target, property, receiver) {
    if (property === "transaction") {
      return async (...args: unknown[]) => {
        const race = staleIssueRace;
        staleIssueRace = null;
        if (race) {
          await db.execute(sql`
            UPDATE owner_applications SET password_hash = ${race.passwordHash}
            WHERE id = ${race.ownerId}
          `);
        }
        const transaction = Reflect.get(target, property, target) as (...values: unknown[]) => unknown;
        return transaction.apply(target, args);
      };
    }
    const member = Reflect.get(target, property, receiver);
    return typeof member === "function" ? member.bind(target) : member;
  },
}) as typeof db;
const sentLinks: Array<{ destination: string; url: string; channel: "email" | "whatsapp" }> = [];
const emailProvider: ResetLinkProvider = {
  async prepare() {
    return {
      async send(destination, url) {
        sentLinks.push({ destination, url, channel: "email" });
      },
    } satisfies PreparedResetSender;
  },
};
const whatsappProvider: ResetLinkProvider = {
  async prepare() {
    return {
      async send(destination, url) {
        sentLinks.push({ destination, url, channel: "whatsapp" });
      },
    };
  },
};
const failingEmailProvider: ResetLinkProvider = {
  async prepare() {
    return {
      async send() {
        throw new Error("smtp-password=must-not-leak");
      },
    };
  },
};
const smtpUnavailableProvider = createPasswordResetEmailProvider({
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
  async verifyConfig() { return false; },
  async resolveAddresses() { return ["203.0.113.9"]; },
  createTransport() {
    throw new Error("verified SMTP transport must not be created");
  },
});

function getRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}

function randomPhone(): string {
  return `050${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
}

async function createOwner(options: { email?: string | null; phone?: string; password?: string } = {}) {
  const phone = options.phone ?? randomPhone();
  const email = options.email ?? null;
  const passwordHash = await bcrypt.hash(options.password ?? "Original1", 4);
  const inserted = await db.execute(sql`
    INSERT INTO owner_applications
      (full_name, business_name, business_type, phone, email, password_hash, status, email_verified)
    VALUES ('Password recovery test', 'Recovery test', 'chalet', ${phone}, ${email}, ${passwordHash}, 'approved', true)
    RETURNING id
  `);
  const id = Number(getRows<{ id: number }>(inserted)[0]?.id);
  ownerIds.push(id);
  return { id, email, phone };
}

async function createStaff(username: string, phone: string) {
  const passwordHash = await bcrypt.hash("Original1", 4);
  const inserted = await db.execute(sql`
    INSERT INTO owner_staff (owner_id, name, username, password_hash, base_salary, phone_num)
    VALUES ('password-recovery-test-owner', 'Recovery staff test', ${username}, ${passwordHash}, 0, ${phone})
    RETURNING id
  `);
  const id = Number(getRows<{ id: number }>(inserted)[0]?.id);
  ownerStaffIds.push(id);
  return id;
}

async function createAdmin(username: string, email: string) {
  const passwordHash = await bcrypt.hash("Original1", 4);
  const inserted = await db.execute(sql`
    INSERT INTO admin_staff (name, username, email, password_hash)
    VALUES ('Recovery admin test', ${username}, ${email}, ${passwordHash})
    RETURNING id
  `);
  const id = Number(getRows<{ id: number }>(inserted)[0]?.id);
  adminIds.push(id);
  return id;
}

async function createOwnerSession(
  userId: string,
  email: string | null,
  accessToken = "password-recovery-session-test",
  ownerApplicationId?: number,
) {
  const sid = randomUUID();
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: { id: userId, email, firstName: null, lastName: null, profileImageUrl: null },
      access_token: accessToken,
      ...(ownerApplicationId === undefined ? {} : { ownerApplicationId }),
    },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  sessionIds.push(sid);
  return sid;
}

async function createReplitUser(email: string): Promise<string> {
  const [user] = await db.insert(usersTable).values({ email }).returning({ id: usersTable.id });
  assert(user);
  userIds.push(user.id);
  return user.id;
}

async function ownerSessionExists(sid: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT sid FROM sessions WHERE sid = ${sid}`);
  return getRows<{ sid: string }>(result).length > 0;
}

async function forgot(
  identifier: string,
  portalType: "public" | "admin" = "public",
  path = "/available",
  forwardedFor?: string,
  identifierType?: string,
) {
  defaultClientAddress = defaultClientAddress % 254 + 1;
  return fetch(`${baseUrl}${path}/forgot-password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": forwardedFor ?? `192.0.2.${defaultClientAddress}`,
    },
    body: JSON.stringify({
      identifier,
      portalType,
      ...(identifierType ? { identifierType } : {}),
    }),
  });
}

async function reset(
  token: string,
  newPassword = "RecoveredPassword2",
  path = "/available",
) {
  return fetch(`${baseUrl}${path}/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
}

function tokenFromLastLink(): string {
  const link = sentLinks.at(-1)?.url;
  assert(link);
  return new URL(link).searchParams.get("token")!;
}

before(async () => {
  const app = express();
  app.set("trust proxy", apiApp.get("trust proxy"));
  app.use(express.json());
  app.use("/available", createPasswordResetRouter({
    database: db,
    emailProvider,
    whatsappProvider,
  }));
  app.use("/unavailable", createPasswordResetRouter({ database: db, emailProvider }));
  app.use("/delivery-fails", createPasswordResetRouter({
    database: db,
    emailProvider: failingEmailProvider,
  }));
  app.use("/token-cases", createPasswordResetRouter({
    database: db,
    emailProvider,
    whatsappProvider,
  }));
  app.use("/smtp-unavailable", createPasswordResetRouter({
    database: db,
    emailProvider: smtpUnavailableProvider,
    whatsappProvider,
  }));
  app.use("/stale-issuance", createPasswordResetRouter({
    database: staleIssueDatabase,
    emailProvider,
    whatsappProvider,
  }));
  app.use("/proxy-limit", createPasswordResetRouter({
    database: db,
    emailProvider,
    whatsappProvider,
  }));
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  for (const [targetType, ids] of [
    ["owner_application", ownerIds],
    ["owner_staff", ownerStaffIds],
    ["admin_staff", adminIds],
  ] as const) {
    for (const id of ids) {
      await db.execute(sql`
        DELETE FROM password_reset_tokens
        WHERE target_type = ${targetType} AND target_id = ${String(id)}
      `);
    }
  }
  for (const sid of sessionIds) {
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`);
  }
  for (const userId of ownerLinkUserIds) {
    await db.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, userId));
  }
  for (const userId of userIds) {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  }
  for (const sid of staffSessionIds) {
    await db.execute(sql`DELETE FROM staff_sessions WHERE sid = ${sid}`);
  }
  for (const sid of adminSessionIds) {
    await db.execute(sql`DELETE FROM admin_sessions WHERE sid = ${sid}`);
  }
  for (const id of ownerIds) await db.execute(sql`DELETE FROM owner_applications WHERE id = ${id}`);
  for (const id of ownerStaffIds) await db.execute(sql`DELETE FROM owner_staff WHERE id = ${id}`);
  for (const id of adminIds) await db.execute(sql`DELETE FROM admin_staff WHERE id = ${id}`);
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

describe("custom-auth password recovery", () => {
  it("uses a generic response for unknown and ambiguous email matches", async () => {
    const email = `duplicate-${Date.now()}@example.test`;
    await createOwner({ email });
    await createOwner({ email });
    const beforeCount = sentLinks.length;

    const duplicateResponse = await forgot(email);
    assert.equal(duplicateResponse.status, 200);
    assert.deepEqual(await duplicateResponse.json(), { ok: true, channel: "email" });
    assert.equal(sentLinks.length, beforeCount);

    const unknownResponse = await forgot(`missing-${Date.now()}@example.test`);
    assert.equal(unknownResponse.status, 200);
    assert.deepEqual(await unknownResponse.json(), { ok: true, channel: "email" });
    assert.equal(sentLinks.length, beforeCount);

    const phone = randomPhone();
    await createOwner({ phone });
    await createOwner({ phone: `+966 ${phone.slice(1)}` });
    const duplicatePhoneResponse = await forgot(phone);
    assert.equal(duplicatePhoneResponse.status, 200);
    assert.deepEqual(await duplicatePhoneResponse.json(), { ok: true, channel: "whatsapp" });
    assert.equal(sentLinks.length, beforeCount);
  });

  it("recovers phone-only owner accounts regardless of legacy phone_verified and consumes tokens atomically", async () => {
    const localPhone = randomPhone();
    const arabicDigits = localPhone.replace(/\d/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]!);
    const storedPhone = `+٩٦٦ ${arabicDigits.slice(1)}`;
    const duplicateEmail = `session-identity-${Date.now()}@example.test`;
    const owner = await createOwner({ phone: storedPhone, email: duplicateEmail });
    const otherOwner = await createOwner({ email: duplicateEmail });
    const ambiguousEmailUserId = await createReplitUser(duplicateEmail);
    const durableUserId = `recovery-durable-user-${randomUUID()}`;
    await db.insert(ownerAccountLinksTable).values({
      userId: durableUserId,
      ownerApplicationId: owner.id,
    });
    ownerLinkUserIds.push(durableUserId);
    const legacyOwnerSession = await createOwnerSession(`owner_${owner.id}`, duplicateEmail, "owner_password_auth");
    const durableOwnerSession = await createOwnerSession(durableUserId, duplicateEmail, "replit-session");
    const newOwnerLoginSession = await createOwnerSession(
      ambiguousEmailUserId,
      duplicateEmail,
      "owner_password_auth",
      owner.id,
    );
    const ambiguousLegacySession = await createOwnerSession(
      ambiguousEmailUserId,
      duplicateEmail,
      "owner_password_auth",
    );
    const duplicateEmailSession = await createOwnerSession(
      ambiguousEmailUserId,
      duplicateEmail,
      "replit-oidc-session",
    );
    const otherOwnerSession = await createOwnerSession(
      `owner_${otherOwner.id}`,
      duplicateEmail,
      "owner_password_auth",
    );
    const beforeCount = sentLinks.length;

    const response = await forgot(owner.phone);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, channel: "whatsapp" });
    assert.equal(sentLinks.length, beforeCount + 1);
    assert.equal(sentLinks.at(-1)?.destination, localPhone);

    const token = tokenFromLastLink();
    const siblingToken = randomBytes(32).toString("base64url");
    await db.execute(sql`
      INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
      VALUES ('owner_application', ${String(owner.id)}, ${hashRecoveryToken(siblingToken)}, ${new Date(Date.now() + 60 * 60 * 1000)})
    `);
    const storedTokenResult = await db.execute(sql`
      SELECT token FROM password_reset_tokens
      WHERE target_type = 'owner_application' AND target_id = ${String(owner.id)}
        AND token = ${hashRecoveryToken(token)}
    `);
    const storedToken = getRows<{ token: string }>(storedTokenResult)[0]?.token;
    assert.equal(storedToken, hashRecoveryToken(token));
    assert.notEqual(storedToken, token);

    const concurrent = await Promise.all([reset(token), reset(token)]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 410]);
    const passwordResult = await db.execute(sql`
      SELECT password_hash FROM owner_applications WHERE id = ${owner.id}
    `);
    const newHash = getRows<{ password_hash: string }>(passwordResult)[0]?.password_hash;
    assert(newHash);
    assert.equal(await bcrypt.compare("RecoveredPassword2", newHash), true);

    const resetTokenRows = await db.execute(sql`
      SELECT used FROM password_reset_tokens
      WHERE target_type = 'owner_application' AND target_id = ${String(owner.id)}
    `);
    assert.equal(getRows<{ used: boolean }>(resetTokenRows).length, 2);
    assert.equal(getRows<{ used: boolean }>(resetTokenRows).every(row => row.used), true);
    assert.equal(await ownerSessionExists(legacyOwnerSession), false);
    assert.equal(await ownerSessionExists(durableOwnerSession), false);
    assert.equal(await ownerSessionExists(newOwnerLoginSession), false);
    assert.equal(await ownerSessionExists(ambiguousLegacySession), true);
    assert.equal(await ownerSessionExists(otherOwnerSession), true);
    assert.equal(await ownerSessionExists(duplicateEmailSession), true);
  });

  it("revokes only unique-email legacy owner-password sessions without conflicting mappings", async () => {
    const email = `legacy-owner-session-${Date.now()}@example.test`;
    await createOwner({ email });
    const replitUserId = await createReplitUser(email);
    const legacyCustomSession = await createOwnerSession(replitUserId, email, "owner_password_auth");
    const oidcSession = await createOwnerSession(replitUserId, email, "oidc-session");

    assert.equal((await (await forgot(email)).json() as { ok: boolean }).ok, true);
    assert.equal((await reset(tokenFromLastLink())).status, 200);
    assert.equal(await ownerSessionExists(legacyCustomSession), false);
    assert.equal(await ownerSessionExists(oidcSession), true);

    const conflictingEmail = `conflicting-owner-session-${Date.now()}@example.test`;
    const conflictTarget = await createOwner({ email: conflictingEmail });
    const mappingTarget = await createOwner();
    const conflictingUserId = await createReplitUser(conflictingEmail);
    await db.insert(ownerAccountLinksTable).values({
      userId: conflictingUserId,
      ownerApplicationId: mappingTarget.id,
    });
    ownerLinkUserIds.push(conflictingUserId);
    const conflictingSession = await createOwnerSession(
      conflictingUserId,
      conflictingEmail,
      "owner_password_auth",
    );

    assert.equal((await (await forgot(conflictingEmail)).json() as { ok: boolean }).ok, true);
    assert.equal((await reset(tokenFromLastLink())).status, 200);
    assert.equal(await ownerSessionExists(conflictingSession), true);
  });

  it("rejects reset-link issuance when the observed password hash becomes stale", async () => {
    const email = `stale-reset-issue-${Date.now()}@example.test`;
    const owner = await createOwner({ email });
    const changedPasswordHash = await bcrypt.hash("ChangedBeforeIssue2", 4);
    staleIssueRace = { ownerId: owner.id, passwordHash: changedPasswordHash };
    const beforeCount = sentLinks.length;

    const response = await forgot(email, "public", "/stale-issuance");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, channel: "email" });
    assert.equal(sentLinks.length, beforeCount);

    const tokenResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM password_reset_tokens
      WHERE target_type = 'owner_application' AND target_id = ${String(owner.id)}
    `);
    assert.equal(getRows<{ count: number }>(tokenResult)[0]?.count, 0);
    const passwordResult = await db.execute(sql`
      SELECT password_hash FROM owner_applications WHERE id = ${owner.id}
    `);
    assert.equal(getRows<{ password_hash: string }>(passwordResult)[0]?.password_hash, changedPasswordHash);
  });

  it("keeps owner staff username recovery and updates the explicit owner_staff target", async () => {
    const username = `123staff_${Date.now()}`;
    const staffId = await createStaff(username, randomPhone());
    const staffSessionId = randomUUID();
    staffSessionIds.push(staffSessionId);
    await db.execute(sql`
      INSERT INTO staff_sessions (sid, staff_id, owner_id, expire)
      VALUES (${staffSessionId}, ${staffId}, 'password-recovery-test-owner', ${new Date(Date.now() + 60 * 60 * 1000)})
    `);
    const response = await forgot(username);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, channel: "whatsapp" });
    assert.equal(new URL(sentLinks.at(-1)!.url).searchParams.get("portalType"), "public");

    const result = await reset(tokenFromLastLink());
    assert.equal(result.status, 200);
    const hashResult = await db.execute(sql`SELECT password_hash FROM owner_staff WHERE id = ${staffId}`);
    assert.equal(
      await bcrypt.compare("RecoveredPassword2", getRows<{ password_hash: string }>(hashResult)[0]!.password_hash),
      true,
    );
    const revokedSession = await db.execute(sql`SELECT sid FROM staff_sessions WHERE sid = ${staffSessionId}`);
    assert.equal(getRows<{ sid: string }>(revokedSession).length, 0);
  });

  it("routes explicit public staff usernames exclusively, even when they resemble owner identifiers", async () => {
    const phoneUsername = randomPhone();
    const emailUsername = `staff-collision-${Date.now()}@example.test`;
    const cases = [
      { username: String(Date.now()), owner: {} },
      { username: phoneUsername, owner: { phone: phoneUsername } },
      { username: emailUsername, owner: { email: emailUsername } },
    ];

    for (const testCase of cases) {
      const owner = await createOwner(testCase.owner);
      const staffId = await createStaff(testCase.username, randomPhone());
      const response = await forgot(testCase.username, "public", "/available", undefined, "username");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, channel: "whatsapp" });

      const token = tokenFromLastLink();
      const resetResponse = await reset(token);
      assert.equal(resetResponse.status, 200);

      const staffPasswordResult = await db.execute(sql`
        SELECT password_hash FROM owner_staff WHERE id = ${staffId}
      `);
      const staffHash = getRows<{ password_hash: string }>(staffPasswordResult)[0]?.password_hash;
      assert(staffHash);
      assert.equal(await bcrypt.compare("RecoveredPassword2", staffHash), true);

      const ownerPasswordResult = await db.execute(sql`
        SELECT password_hash FROM owner_applications WHERE id = ${owner.id}
      `);
      const ownerHash = getRows<{ password_hash: string }>(ownerPasswordResult)[0]?.password_hash;
      assert(ownerHash);
      assert.equal(await bcrypt.compare("Original1", ownerHash), true);
      assert.equal(await bcrypt.compare("RecoveredPassword2", ownerHash), false);

      const tokenTargetResult = await db.execute(sql`
        SELECT target_type, target_id FROM password_reset_tokens
        WHERE token = ${hashRecoveryToken(token)}
      `);
      assert.deepEqual(getRows<{ target_type: string; target_id: string }>(tokenTargetResult)[0], {
        target_type: "owner_staff",
        target_id: String(staffId),
      });
    }

    const rejectedAdminMarker = await forgot(
      "existing-admin",
      "admin",
      "/available",
      undefined,
      "username",
    );
    assert.equal(rejectedAdminMarker.status, 400);
    const rejectedUnknownMarker = await forgot(
      "unknown-marker",
      "public",
      "/available",
      undefined,
      "email",
    );
    assert.equal(rejectedUnknownMarker.status, 400);
  });

  it("keeps admin username/email recovery and puts the admin portal in the emailed reset link", async () => {
    const username = `admin_${Date.now()}`;
    const email = `${username}@example.test`;
    const adminId = await createAdmin(username, email);
    const adminSessionId = randomUUID();
    adminSessionIds.push(adminSessionId);
    await db.execute(sql`
      INSERT INTO admin_sessions (sid, admin_staff_id, expire)
      VALUES (${adminSessionId}, ${adminId}, ${new Date(Date.now() + 60 * 60 * 1000)})
    `);
    const response = await forgot(username, "admin");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, channel: "email" });
    assert.equal(sentLinks.at(-1)?.destination, email);
    assert.equal(new URL(sentLinks.at(-1)!.url).searchParams.get("portalType"), "admin");

    const result = await reset(tokenFromLastLink());
    assert.equal(result.status, 200);
    const hashResult = await db.execute(sql`SELECT password_hash FROM admin_staff WHERE id = ${adminId}`);
    assert.equal(
      await bcrypt.compare("RecoveredPassword2", getRows<{ password_hash: string }>(hashResult)[0]!.password_hash),
      true,
    );
    const revokedSession = await db.execute(sql`SELECT sid FROM admin_sessions WHERE sid = ${adminSessionId}`);
    assert.equal(getRows<{ sid: string }>(revokedSession).length, 0);
  });

  it("returns global channel-unavailable for phone recovery without inserting a token", async () => {
    const owner = await createOwner({ phone: randomPhone() });
    const beforeResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM password_reset_tokens
      WHERE target_type = 'owner_application' AND target_id = ${String(owner.id)}
    `);
    const beforeCount = getRows<{ count: number }>(beforeResult)[0]?.count;
    const response = await forgot(owner.phone, "public", "/unavailable");
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, "channel_unavailable");
    const afterResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM password_reset_tokens
      WHERE target_type = 'owner_application' AND target_id = ${String(owner.id)}
    `);
    assert.equal(getRows<{ count: number }>(afterResult)[0]?.count, beforeCount);
  });

  it("returns the same global email-channel failure before looking up known or unknown accounts", async () => {
    const owner = await createOwner({ email: `smtp-unavailable-${Date.now()}@example.test` });
    const missingEmail = `smtp-missing-${Date.now()}@example.test`;

    const unknownResponse = await forgot(missingEmail, "public", "/smtp-unavailable");
    const knownResponse = await forgot(owner.email!, "public", "/smtp-unavailable");
    assert.equal(unknownResponse.status, 503);
    assert.equal(knownResponse.status, 503);
    const unknownBody = await unknownResponse.json();
    const knownBody = await knownResponse.json();
    assert.deepEqual(unknownBody, knownBody);
    assert.equal((knownBody as { code: string }).code, "channel_unavailable");
  });

  it("uses one trusted proxy hop for recovery rate-limit client IPs", async () => {
    assert.equal(apiApp.get("trust proxy"), 1);
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await forgot(
        `proxy-client-a-${attempt}@example.test`,
        "public",
        "/proxy-limit",
        `192.0.2.${attempt}, 203.0.113.10`,
      );
      assert.equal(response.status, 200);
    }

    const spoofedEarlierEntry = await forgot(
      "proxy-client-a-over-limit@example.test",
      "public",
      "/proxy-limit",
      "198.51.100.99, 203.0.113.10",
    );
    assert.equal(spoofedEarlierEntry.status, 429);

    const distinctForwardedClient = await forgot(
      "proxy-client-b@example.test",
      "public",
      "/proxy-limit",
      "192.0.2.88, 203.0.113.20",
    );
    assert.equal(distinctForwardedClient.status, 200);
  });

  it("returns a sanitized delivery error and revokes an undelivered email token", async () => {
    const email = `delivery-failure-${Date.now()}@example.test`;
    const owner = await createOwner({ email });
    const response = await forgot(email, "public", "/delivery-fails");
    assert.equal(response.status, 503);
    const body = await response.json() as { code: string; error: string };
    assert.equal(body.code, "delivery_failed");
    assert.equal(body.error.includes(email), false);
    assert.equal(body.error.includes("smtp-password"), false);

    const result = await db.execute(sql`
      SELECT used FROM password_reset_tokens
      WHERE target_type = 'owner_application' AND target_id = ${String(owner.id)}
      ORDER BY id DESC LIMIT 1
    `);
    assert.equal(getRows<{ used: boolean }>(result)[0]?.used, true);
  });

  it("rejects expired, reused, unknown-target, and legacy plaintext tokens", async () => {
    const owner = await createOwner();
    const nowExpired = `expired-${Date.now()}-00000000000000000000000000000000`;
    const legacyPlain = `legacy-${Date.now()}-00000000000000000000000000000000`;
    const invalidTarget = `target-${Date.now()}-00000000000000000000000000000000`;
    await db.execute(sql`
      INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
      VALUES
        ('owner_application', ${String(owner.id)}, ${hashRecoveryToken(nowExpired)}, ${new Date(Date.now() - 60_000)}),
        ('owner_application', ${String(owner.id)}, ${legacyPlain}, ${new Date(Date.now() + 60_000)}),
        ('unknown_future_type', ${String(owner.id)}, ${hashRecoveryToken(invalidTarget)}, ${new Date(Date.now() + 60_000)})
    `);

    assert.equal((await reset(nowExpired, "RecoveredPassword2", "/token-cases")).status, 410);
    assert.equal((await reset(legacyPlain, "RecoveredPassword2", "/token-cases")).status, 410);
    assert.equal((await reset(invalidTarget, "RecoveredPassword2", "/token-cases")).status, 410);
  });
});