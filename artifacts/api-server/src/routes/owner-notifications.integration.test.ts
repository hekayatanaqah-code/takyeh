import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, ownerNotificationsTable, ownerBookingsTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";

const owner = `notification-search-test-${randomUUID()}`;
const other = `notification-search-test-${randomUUID()}`;
const server = createServer(app);
const sessions: string[] = [];
let base: string;
let session: string;
let bookingId: number;

before(async () => {
  session = await createSession({ user: { id: owner, email: null, firstName: null, lastName: null, profileImageUrl: null }, access_token: "integration-test" });
  sessions.push(session);
  const [booking] = await db.insert(ownerBookingsTable).values({
    ownerId: owner, clientName: "عميل اختبار الإشعارات", bookingDate: "2026-10-23", period: "morning",
  }).returning();
  bookingId = booking.id;
  await db.insert(ownerNotificationsTable).values([
    ...Array.from({ length: 55 }, (_, i) => ({
      ownerId: owner, type: "booking_reminder", bookingId,
      message: `تذكير اختباري ${i}`, isRead: i % 2 === 0,
    })),
    { ownerId: other, type: "new_booking", message: "إشعار مالك آخر", isRead: false },
  ]);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}/api/owner/notifications`;
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.delete(ownerNotificationsTable).where(inArray(ownerNotificationsTable.ownerId, [owner, other]));
  await db.delete(ownerBookingsTable).where(eq(ownerBookingsTable.ownerId, owner));
  if (sessions.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessions));
  await pool.end();
});

it("returns complete authorized history and booking search metadata without changing live alert limits", async () => {
  const headers = { Cookie: `sid=${session}` };
  const latest = await fetch(base, { headers });
  assert.equal(latest.status, 200);
  const latestRows = await latest.json();
  assert(Array.isArray(latestRows));
  assert.equal(latestRows.length, 50);
  const history = await fetch(`${base}?history=true`, { headers });
  assert.equal(history.status, 200);
  const rows = await history.json();
  assert(Array.isArray(rows));
  assert.equal(rows.length, 55);
  assert(rows.every((n: any) => n.ownerId === owner && n.bookingId === bookingId && n.clientName === "عميل اختبار الإشعارات"));
  assert(rows.every((n: any, i: number) => i === 0 || rows[i - 1].id > n.id));
});

it("requires authentication and rejects invalid history queries", async () => {
  assert.equal((await fetch(`${base}?history=true`)).status, 401);
  assert.equal((await fetch(`${base}?history=invalid`, { headers: { Cookie: `sid=${session}` } })).status, 400);
});
