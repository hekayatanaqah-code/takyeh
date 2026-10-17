import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, ownerNotificationSettingsTable, ownerSubscriptionsTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";

const owners = [`message-fixture-${randomUUID()}`, `message-fixture-${randomUUID()}`];
const sessions: string[] = [];
const customTemplates = [{ id: "preserve", title: "قالب مخصص", body: "صياغة خاصة بالمالك" }];
let server: Server;
let baseUrl = "";

before(async () => {
  for (const ownerId of owners) {
    sessions.push(await createSession({
      user: { id: ownerId, email: `${ownerId}@example.test`, firstName: "اختبار", lastName: "", profileImageUrl: null },
      access_token: "isolated-integration-fixture",
    }));
    await db.insert(ownerSubscriptionsTable).values({
      ownerId, plan: "chalet_pro", status: "active", expiresAt: new Date(Date.now() + 86400000),
    });
  }
  await db.insert(ownerNotificationSettingsTable).values({
    ownerId: owners[0], waToken: JSON.stringify(customTemplates),
    bookingConfirmationTemplate: "تأكيد بصياغة خاصة دون المتغيرات الافتراضية",
    changeNoticeTemplate: "تعديل بصياغة خاصة",
  });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/owner/message-settings`;
});

after(async () => {
  await db.delete(ownerNotificationSettingsTable).where(inArray(ownerNotificationSettingsTable.ownerId, owners));
  await db.delete(ownerSubscriptionsTable).where(inArray(ownerSubscriptionsTable.ownerId, owners));
  if (sessions.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessions));
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
});

async function request(method = "GET", body?: unknown, session = sessions[0]) {
  const response = await fetch(baseUrl, {
    method,
    headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, data: await response.json() as Record<string, unknown> };
}

test("receipt template persists, preserves legacy custom templates and is owner-scoped", async () => {
  const initial = await request();
  assert.equal(initial.response.status, 200);
  assert.equal(initial.data.detailedReceiptTemplate, null);
  assert.deepEqual(initial.data.customTemplates, customTemplates);
  assert.equal(initial.data.bookingConfirmationTemplate, "تأكيد بصياغة خاصة دون المتغيرات الافتراضية");
  assert.equal(initial.data.modificationTemplate, "تعديل بصياغة خاصة");

  const template = "إيصالي الخاص {اسم_العقار}\n{اسم_المنصة}\n{الشروط_والأحكام}";
  const saved = await request("PUT", { ...initial.data, detailedReceiptTemplate: template });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.detailedReceiptTemplate, template);
  assert.deepEqual(saved.data.customTemplates, customTemplates);
  assert.equal((await request()).data.detailedReceiptTemplate, template);
  const [persisted] = await db.select().from(ownerNotificationSettingsTable).where(eq(ownerNotificationSettingsTable.ownerId, owners[0]));
  assert.equal(JSON.parse(persisted.waToken!).detailedReceiptTemplate, template);

  const otherOwner = await request("GET", undefined, sessions[1]);
  assert.equal(otherOwner.response.status, 200);
  assert.equal(otherOwner.data.detailedReceiptTemplate, null);
  assert.deepEqual(otherOwner.data.customTemplates, []);

  const legacySave = await request("PUT", { ...saved.data, detailedReceiptTemplate: undefined });
  assert.equal(legacySave.response.status, 200);
  assert.equal(legacySave.data.detailedReceiptTemplate, template);
  assert.deepEqual(legacySave.data.customTemplates, customTemplates);

  const invalid = await request("PUT", { detailedReceiptTemplate: 123 });
  assert.equal(invalid.response.status, 400);
  assert.equal((await request()).data.detailedReceiptTemplate, template);
});
