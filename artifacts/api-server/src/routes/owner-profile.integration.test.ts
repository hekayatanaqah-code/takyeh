import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import {
  db,
  pool,
  serviceProvidersTable,
  sessionsTable,
} from "@workspace/db";

let server: Server;
let baseUrl: string;
const ownerId = `owner-profile-test-${randomUUID()}`;
const email = `owner-profile-${randomUUID()}@example.test`;
let sessionId = "";
let otherSessionId = "";
let providerId = 0;

async function listen(serverToStart: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => resolve());
  });
  const address = serverToStart.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function profileRequest(method: "GET" | "PUT", body?: Record<string, string>) {
  const response = await fetch(`${baseUrl}/api/owner/profile`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionId}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, json: await response.json() as Record<string, any> };
}

before(async () => {
  server = createServer(app);
  baseUrl = await listen(server);
  sessionId = await createSession({
    user: {
      id: ownerId,
      email,
      firstName: "مالك",
      lastName: "الخدمة",
      profileImageUrl: null,
    },
    access_token: "integration-test",
  });
  const [provider] = await db
    .insert(serviceProvidersTable)
    .values({
      ownerId,
      businessName: "مزود خدمة اختبار",
      category: "test",
      city: "القصيم",
      whatsappNumber: "0500000011",
      galleryPhotos: [],
      coverageTags: [],
      customFeatureTags: [],
      photoCaptions: [],
      isActive: true,
    })
    .returning({ id: serviceProvidersTable.id });
  assert(provider);
  providerId = provider.id;
});

after(async () => {
  await db.delete(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId));
  await db.execute(sql`DELETE FROM owner_account_links WHERE user_id = ${ownerId}`);
  await db.execute(sql`DELETE FROM owner_applications WHERE LOWER(email) = LOWER(${email})`);
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  if (otherSessionId) {
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, otherSessionId));
  }
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  await pool.end();
});

describe("owner profile mapping", () => {
  it("creates, loads, and updates a profile for a service-only owner", async () => {
    const [loaded, concurrentLoad] = await Promise.all([
      profileRequest("GET"),
      profileRequest("GET"),
    ]);
    assert.equal(loaded.response.status, 200);
    assert.equal(concurrentLoad.response.status, 200);
    assert.equal(loaded.json.fullName, "مالك الخدمة");
    assert.equal(loaded.json.phone, "0500000011");
    assert.equal(loaded.json.email, email);
    assert.equal(loaded.json.businessType, "service");

    const profileRow = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM owner_applications WHERE LOWER(email) = LOWER(${email})`
    );
    assert.equal(((profileRow as any).rows as Array<{ count: number }>)[0]?.count, 1);

    const saved = await profileRequest("PUT", { fullName: "الاسم المحدث" });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.json.ok, true);

    const reloaded = await profileRequest("GET");
    assert.equal(reloaded.response.status, 200);
    assert.equal(reloaded.json.fullName, "الاسم المحدث");

    const otherOwnerId = `owner-profile-other-${randomUUID()}`;
    otherSessionId = await createSession({
      user: {
        id: otherOwnerId,
        email,
        firstName: "مستخدم",
        lastName: "آخر",
        profileImageUrl: null,
      },
      access_token: "integration-test",
    });
    const otherResponse = await fetch(`${baseUrl}/api/owner/profile`, {
      headers: { Authorization: `Bearer ${otherSessionId}` },
    });
    const otherProfile = await otherResponse.json() as Record<string, any>;
    assert.equal(otherResponse.status, 200);
    assert.equal(otherProfile.fullName, "مستخدم");
    assert.equal(otherProfile.phone, "");
    assert.equal(otherProfile.noApplication, true);

    const otherLink = await db.execute(
      sql`SELECT owner_application_id FROM owner_account_links WHERE user_id = ${otherOwnerId}`
    );
    assert.equal(((otherLink as any).rows as unknown[]).length, 0);
  });
});