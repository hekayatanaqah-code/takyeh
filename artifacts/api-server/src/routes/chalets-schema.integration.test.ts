import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import {
  chaletSubmissionsTable,
  chaletsTable,
  db,
  pool,
  sessionsTable,
} from "@workspace/db";

let server: Server;
let baseUrl: string;
let sessionId: string | undefined;
let submissionId: number | undefined;
let chaletId: number | undefined;

const originalAdminUserId = process.env.ADMIN_USER_ID;
const testAdminId = `chalet-schema-admin-${randomUUID()}`;

async function listen(serverToStart: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => resolve());
  });
  const address = serverToStart.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

before(async () => {
  process.env.ADMIN_USER_ID = testAdminId;
  sessionId = await createSession({
    user: {
      id: testAdminId,
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "integration-test",
  });
  server = createServer(app);
  baseUrl = await listen(server);
});

after(async () => {
  if (chaletId !== undefined) {
    await db.delete(chaletsTable).where(eq(chaletsTable.id, chaletId));
  }
  if (submissionId !== undefined) {
    await db
      .delete(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, submissionId));
  }
  if (sessionId !== undefined) {
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  }

  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();

  if (originalAdminUserId === undefined) {
    delete process.env.ADMIN_USER_ID;
  } else {
    process.env.ADMIN_USER_ID = originalAdminUserId;
  }
});

describe("chalet schema compatibility", () => {
  it("creates a chalet through the admin route with the Drizzle schema", async () => {
    assert(sessionId);
    const ownerId = `chalet-schema-owner-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/admin/direct-add-chalet`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionId}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerId,
        nameAr: `عقار اختبار ${randomUUID()}`,
        location: "القصيم",
        district: "حي الاختبار",
        whatsappNumber: "0500000000",
        pricePerNight: 100,
        descriptionAr: "وصف اختبار توافق المخطط",
      }),
    });
    const json = await response.json() as { submissionId?: number; error?: string };

    assert.equal(response.status, 201, json.error);
    assert.equal(typeof json.submissionId, "number");
    submissionId = json.submissionId;

    const [submission] = await db
      .select()
      .from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, submissionId!))
      .limit(1);
    assert.equal(submission?.ownerId, ownerId);

    const [chalet] = await db
      .select()
      .from(chaletsTable)
      .where(eq(chaletsTable.submissionId, submissionId!))
      .limit(1);
    assert(chalet);
    chaletId = chalet.id;
    assert.equal(chalet.ownerId, ownerId);
  });
});